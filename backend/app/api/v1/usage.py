"""LLM quota and estimated cost statistics."""

import json
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import get_settings
from app.core.deps import get_current_user, require_admin, require_super_admin
from app.db.database import get_db
from app.models.models import LlmUsageEvent, User
from app.services.llm_usage import resolve_monthly_quota

router = APIRouter()


class UserQuotaUpdate(BaseModel):
    monthly_token_quota: int = Field(..., ge=0, le=100_000_000)


def _month_start() -> datetime:
    now = datetime.now(timezone.utc)
    return datetime(now.year, now.month, 1, tzinfo=timezone.utc)


def _pricing_configured() -> bool:
    try:
        value = json.loads(get_settings().LLM_PRICING_JSON or "{}")
        return isinstance(value, dict) and bool(value)
    except json.JSONDecodeError:
        return False


@router.get("/me")
async def get_my_llm_usage(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    month_start = _month_start()
    row = (
        await db.execute(
            select(
                func.count(LlmUsageEvent.id).label("requests"),
                func.coalesce(func.sum(LlmUsageEvent.input_tokens), 0).label("input_tokens"),
                func.coalesce(func.sum(LlmUsageEvent.output_tokens), 0).label("output_tokens"),
                func.coalesce(func.sum(LlmUsageEvent.total_tokens), 0).label("total_tokens"),
                func.coalesce(
                    func.sum(LlmUsageEvent.total_tokens).filter(LlmUsageEvent.source == "platform"),
                    0,
                ).label("platform_tokens"),
                func.coalesce(
                    func.sum(LlmUsageEvent.total_tokens).filter(LlmUsageEvent.source == "user"),
                    0,
                ).label("byok_tokens"),
                func.coalesce(func.sum(LlmUsageEvent.estimated_cost_usd), 0).label("cost"),
            ).where(
                LlmUsageEvent.user_id == user.id,
                LlmUsageEvent.created_at >= month_start,
            )
        )
    ).one()
    quota = resolve_monthly_quota(
        user, get_settings().LLM_MONTHLY_PLATFORM_TOKEN_QUOTA
    )
    platform_tokens = int(row.platform_tokens or 0)
    daily_start = datetime.now(timezone.utc) - timedelta(days=29)
    daily_rows = (
        await db.execute(
            select(
                func.date(LlmUsageEvent.created_at).label("day"),
                func.sum(LlmUsageEvent.total_tokens).label("tokens"),
            )
            .where(
                LlmUsageEvent.user_id == user.id,
                LlmUsageEvent.created_at >= daily_start,
            )
            .group_by(func.date(LlmUsageEvent.created_at))
            .order_by(func.date(LlmUsageEvent.created_at))
        )
    ).all()
    return {
        "month": month_start.strftime("%Y-%m"),
        "monthly_token_quota": quota,
        "platform_tokens": platform_tokens,
        "remaining_platform_tokens": max(0, quota - platform_tokens),
        "quota_percent": round(platform_tokens / quota * 100, 1) if quota else 100,
        "input_tokens": int(row.input_tokens or 0),
        "output_tokens": int(row.output_tokens or 0),
        "total_tokens": int(row.total_tokens or 0),
        "byok_tokens": int(row.byok_tokens or 0),
        "request_count": int(row.requests or 0),
        "estimated_cost_usd": float(row.cost or 0),
        "pricing_configured": _pricing_configured(),
        "daily": [{"date": str(item.day), "tokens": int(item.tokens or 0)} for item in daily_rows],
    }


@router.get("/admin/summary")
async def get_admin_llm_usage(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    month_start = _month_start()
    totals = (
        await db.execute(
            select(
                func.count(LlmUsageEvent.id).label("requests"),
                func.coalesce(func.sum(LlmUsageEvent.total_tokens), 0).label("tokens"),
                func.coalesce(func.sum(LlmUsageEvent.estimated_cost_usd), 0).label("cost"),
            ).where(LlmUsageEvent.created_at >= month_start)
        )
    ).one()
    top_rows = (
        await db.execute(
            select(
                User.id,
                User.email,
                User.nickname,
                func.sum(LlmUsageEvent.total_tokens).label("tokens"),
                func.sum(LlmUsageEvent.estimated_cost_usd).label("cost"),
            )
            .join(LlmUsageEvent, LlmUsageEvent.user_id == User.id)
            .where(LlmUsageEvent.created_at >= month_start)
            .group_by(User.id, User.email, User.nickname)
            .order_by(func.sum(LlmUsageEvent.total_tokens).desc())
            .limit(10)
        )
    ).all()
    return {
        "month": month_start.strftime("%Y-%m"),
        "request_count": int(totals.requests or 0),
        "total_tokens": int(totals.tokens or 0),
        "estimated_cost_usd": float(totals.cost or 0),
        "pricing_configured": _pricing_configured(),
        "top_users": [
            {
                "user_id": str(row.id),
                "email": row.email,
                "nickname": row.nickname,
                "tokens": int(row.tokens or 0),
                "estimated_cost_usd": float(row.cost or 0),
            }
            for row in top_rows
        ],
    }


@router.put("/admin/users/{user_id}/quota")
async def update_user_llm_quota(
    user_id: uuid.UUID,
    body: UserQuotaUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")
    prefs = dict(target.preferences) if isinstance(target.preferences, dict) else {}
    prefs["llm_monthly_token_quota"] = body.monthly_token_quota
    target.preferences = prefs
    flag_modified(target, "preferences")
    await db.commit()
    return {
        "user_id": str(target.id),
        "monthly_token_quota": body.monthly_token_quota,
    }
