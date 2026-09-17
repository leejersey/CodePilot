"""LLM rate limits, platform quotas, token metering, and cost estimation."""

from __future__ import annotations

import json
import logging
import math
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select

from app.core.config import get_settings
from app.db.database import AsyncSessionLocal
from app.db.redis import get_redis
from app.models.models import LlmUsageEvent

logger = logging.getLogger(__name__)


class LLMUsageLimitError(RuntimeError):
    def __init__(self, message: str, *, retry_after: int | None = None):
        super().__init__(message)
        self.retry_after = retry_after


class LLMRateLimitError(LLMUsageLimitError):
    pass


class LLMQuotaExceededError(LLMUsageLimitError):
    pass


@dataclass
class LLMReservation:
    user_id: uuid.UUID | None
    request_type: str
    provider: str
    model: str
    source: str
    input_tokens: int
    reserved_tokens: int = 0
    quota_key: str | None = None
    concurrent_key: str | None = None
    redis_available: bool = False


def estimate_tokens(text: str) -> int:
    return math.ceil(len(text) / 4) if text else 0


def calculate_estimated_cost(
    *,
    input_tokens: int,
    output_tokens: int,
    rates: dict[str, Any] | None,
) -> Decimal | None:
    if not rates:
        return None
    try:
        input_rate = Decimal(str(rates.get("input", 0)))
        output_rate = Decimal(str(rates.get("output", 0)))
    except (ValueError, TypeError):
        return None
    cost = (
        Decimal(input_tokens) * input_rate
        + Decimal(output_tokens) * output_rate
    ) / Decimal(1_000_000)
    return cost.quantize(Decimal("0.000001"))


def should_enforce_platform_quota(source: str) -> bool:
    return source == "platform"


def resolve_monthly_quota(user: Any | None, default: int) -> int:
    prefs = getattr(user, "preferences", None)
    value = prefs.get("llm_monthly_token_quota") if isinstance(prefs, dict) else None
    try:
        return max(0, int(value)) if value is not None else max(0, default)
    except (TypeError, ValueError):
        return max(0, default)


def _pricing_for(model: str) -> dict[str, Any] | None:
    try:
        pricing = json.loads(get_settings().LLM_PRICING_JSON or "{}")
    except json.JSONDecodeError:
        logger.warning("LLM_PRICING_JSON is invalid JSON")
        return None
    if not isinstance(pricing, dict):
        return None
    rates = pricing.get(model) or pricing.get("*")
    return rates if isinstance(rates, dict) else None


def _month_bounds() -> tuple[datetime, str, int]:
    now = datetime.now(timezone.utc)
    start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    if now.month == 12:
        next_month = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        next_month = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)
    ttl = max(60, int((next_month - now).total_seconds()) + 60)
    return start, now.strftime("%Y-%m"), ttl


async def begin_llm_request(
    cfg: Any,
    *,
    prompt_text: str,
    request_type: str = "general",
) -> LLMReservation:
    settings = get_settings()
    user_id = getattr(cfg, "user_id", None)
    reservation = LLMReservation(
        user_id=user_id,
        request_type=request_type[:40] or "general",
        provider=str(cfg.provider)[:40],
        model=str(cfg.model)[:120],
        source=str(cfg.source)[:20],
        input_tokens=estimate_tokens(prompt_text),
    )
    if not user_id:
        return reservation

    redis = None
    try:
        redis = await get_redis()
        minute = int(time.time() // 60)
        rate_key = f"codepilot:llm:rate:{user_id}:{minute}"
        count = await redis.incr(rate_key)
        if count == 1:
            await redis.expire(rate_key, 120)
        if count > settings.LLM_RATE_LIMIT_PER_MINUTE:
            raise LLMRateLimitError("LLM 请求过于频繁，请稍后重试", retry_after=60)

        concurrent_key = f"codepilot:llm:concurrent:{user_id}"
        concurrent = await redis.incr(concurrent_key)
        await redis.expire(concurrent_key, 600)
        if concurrent > settings.LLM_MAX_CONCURRENT_REQUESTS:
            await redis.decr(concurrent_key)
            raise LLMRateLimitError("同时进行的 LLM 请求过多，请等待当前请求完成")
        reservation.concurrent_key = concurrent_key
        reservation.redis_available = True

        if should_enforce_platform_quota(cfg.source):
            quota_limit = int(getattr(cfg, "monthly_token_quota", 0))
            start, month, ttl = _month_bounds()
            quota_key = f"codepilot:llm:quota:{user_id}:{month}"
            if not await redis.exists(quota_key):
                async with AsyncSessionLocal() as db:
                    used = await db.scalar(
                        select(func.coalesce(func.sum(LlmUsageEvent.total_tokens), 0)).where(
                            LlmUsageEvent.user_id == user_id,
                            LlmUsageEvent.source == "platform",
                            LlmUsageEvent.created_at >= start,
                        )
                    )
                await redis.set(quota_key, int(used or 0), ex=ttl, nx=True)
            reserved = reservation.input_tokens + settings.LLM_QUOTA_RESERVE_OUTPUT_TOKENS
            after_reserve = await redis.incrby(quota_key, reserved)
            await redis.expire(quota_key, ttl)
            if after_reserve > quota_limit:
                await redis.decrby(quota_key, reserved)
                await redis.decr(concurrent_key)
                reservation.concurrent_key = None
                raise LLMQuotaExceededError(
                    "本月平台 LLM 配额已用完，请切换个人 API Key 或下月再试"
                )
            reservation.reserved_tokens = reserved
            reservation.quota_key = quota_key
    except LLMUsageLimitError:
        raise
    except Exception as exc:
        logger.warning("LLM Redis usage guard unavailable: %s", exc)
        reservation.redis_available = False
        reservation.concurrent_key = None
        reservation.quota_key = None
        reservation.reserved_tokens = 0
    return reservation


async def finish_llm_request(
    reservation: LLMReservation,
    *,
    input_tokens: int | None = None,
    output_tokens: int = 0,
    status: str = "success",
    error_message: str | None = None,
) -> None:
    actual_input = reservation.input_tokens if input_tokens is None else max(0, input_tokens)
    output_tokens = max(0, output_tokens)
    total_tokens = actual_input + output_tokens

    if reservation.redis_available:
        try:
            redis = await get_redis()
            if reservation.quota_key:
                await redis.incrby(
                    reservation.quota_key,
                    total_tokens - reservation.reserved_tokens,
                )
            if reservation.concurrent_key:
                remaining = await redis.decr(reservation.concurrent_key)
                if remaining < 0:
                    await redis.set(reservation.concurrent_key, 0, ex=60)
        except Exception as exc:
            logger.warning("LLM Redis usage reconciliation failed: %s", exc)

    if not reservation.user_id:
        return
    try:
        async with AsyncSessionLocal() as db:
            db.add(
                LlmUsageEvent(
                    user_id=reservation.user_id,
                    request_type=reservation.request_type,
                    provider=reservation.provider,
                    model=reservation.model,
                    source=reservation.source,
                    input_tokens=actual_input,
                    output_tokens=output_tokens,
                    total_tokens=total_tokens,
                    estimated_cost_usd=calculate_estimated_cost(
                        input_tokens=actual_input,
                        output_tokens=output_tokens,
                        rates=_pricing_for(reservation.model),
                    ),
                    status=status[:20],
                    error_message=(error_message or "")[:500] or None,
                )
            )
            await db.commit()
    except Exception as exc:
        logger.warning("Failed to persist LLM usage: %s", exc)
