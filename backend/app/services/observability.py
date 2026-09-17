"""Structured logging, error persistence, Sentry, and deduplicated alerts."""

from __future__ import annotations

import json
import logging
import re
import sys
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.config import get_settings
from app.db.database import AsyncSessionLocal
from app.db.redis import get_redis

request_id_context: ContextVar[str | None] = ContextVar("request_id", default=None)
logger = logging.getLogger(__name__)

SENSITIVE_KEYS = {
    "authorization",
    "cookie",
    "password",
    "current_password",
    "new_password",
    "api_key",
    "token",
    "secret",
    "jwt",
}


def new_error_id() -> str:
    return f"err_{uuid.uuid4().hex[:12]}"


def sanitize_context(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            str(key): (
                "[REDACTED]"
                if any(sensitive in str(key).lower() for sensitive in SENSITIVE_KEYS)
                else sanitize_context(item)
            )
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [sanitize_context(item) for item in value]
    if isinstance(value, str):
        value = re.sub(
            r"(?i)(authorization\s*:\s*bearer\s+)[^\s,;]+",
            r"\1[REDACTED]",
            value,
        )
        value = re.sub(
            r"(?i)((?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s,;&]+",
            r"\1[REDACTED]",
            value,
        )
        if len(value) > 2000:
            return value[:2000] + "…"
    return value


def should_send_burst_alert(count: int, *, threshold: int) -> bool:
    return count == threshold


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", None) or request_id_context.get(),
        }
        for key in ("method", "path", "status_code", "duration_ms", "user_id", "error_id"):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(sanitize_context(payload), ensure_ascii=False, default=str)


def configure_structured_logging() -> None:
    settings = get_settings()
    root = logging.getLogger()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.handlers = [handler]
    root.setLevel(getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))


def configure_sentry() -> None:
    settings = get_settings()
    if not settings.SENTRY_DSN:
        return
    try:
        import sentry_sdk

        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.APP_ENV,
            traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
            send_default_pii=False,
        )
    except Exception as exc:
        logger.warning("Sentry initialization failed: %s", exc)


async def persist_error(
    *,
    error_id: str,
    service: str,
    message: str,
    exception_type: str | None = None,
    level: str = "error",
    request_id: str | None = None,
    user_id: uuid.UUID | None = None,
    path: str | None = None,
    method: str | None = None,
    status_code: int | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    try:
        from app.models.models import ErrorEvent

        async with AsyncSessionLocal() as db:
            db.add(ErrorEvent(
                error_id=error_id,
                service=service[:40],
                level=level[:20],
                message=message[:2000],
                exception_type=(exception_type or "")[:200] or None,
                request_id=(request_id or "")[:64] or None,
                user_id=user_id,
                path=(path or "")[:500] or None,
                method=(method or "")[:10] or None,
                status_code=status_code,
                details=sanitize_context(details or {}),
            ))
            await db.commit()
    except Exception as exc:
        logger.error("Failed to persist error event: %s", exc)


async def send_alert(
    title: str,
    message: str,
    *,
    dedup_key: str,
    details: dict[str, Any] | None = None,
) -> None:
    settings = get_settings()
    if not settings.ALERT_WEBHOOK_URL:
        return
    try:
        try:
            redis = await get_redis()
            allowed = await redis.set(
                f"codepilot:alert:dedup:{dedup_key}",
                "1",
                ex=settings.ALERT_COOLDOWN_SECONDS,
                nx=True,
            )
            if not allowed:
                return
        except Exception as exc:
            logger.warning("Alert dedup unavailable, sending without deduplication: %s", exc)
        payload = {
            "title": title,
            "message": message,
            "environment": settings.APP_ENV,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "details": sanitize_context(details or {}),
        }
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.post(settings.ALERT_WEBHOOK_URL, json=payload)
            response.raise_for_status()
    except Exception as exc:
        logger.error("Failed to send alert: %s", exc)


async def track_server_error_burst(path: str, status_code: int) -> None:
    settings = get_settings()
    try:
        redis = await get_redis()
        minute = int(datetime.now(timezone.utc).timestamp() // 60)
        key = f"codepilot:errors:burst:{path}:{minute}"
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, 120)
        if should_send_burst_alert(count, threshold=settings.ALERT_5XX_THRESHOLD_PER_MINUTE):
            await send_alert(
                "CodePilot 5xx 错误激增",
                f"{path} 一分钟内已出现 {count} 次服务端错误",
                dedup_key=f"5xx:{path}",
                details={"path": path, "status_code": status_code, "count": count},
            )
    except Exception as exc:
        logger.error("Failed to track 5xx burst: %s", exc)


def capture_exception(exc: BaseException, *, error_id: str) -> None:
    try:
        import sentry_sdk

        with sentry_sdk.push_scope() as scope:
            scope.set_tag("error_id", error_id)
            scope.set_tag("request_id", request_id_context.get() or "")
            sentry_sdk.capture_exception(exc)
    except Exception:
        pass


def capture_message(message: str, *, error_id: str, details: dict[str, Any] | None = None) -> None:
    try:
        import sentry_sdk

        with sentry_sdk.push_scope() as scope:
            scope.set_tag("error_id", error_id)
            scope.set_context("client_error", sanitize_context(details or {}))
            sentry_sdk.capture_message(message, level="error")
    except Exception:
        pass
