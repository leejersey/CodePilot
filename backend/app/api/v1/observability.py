"""Administrator observability and client error reporting APIs."""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_admin
from app.db.database import get_db
from app.models.models import BackgroundJob, ErrorEvent, User
from app.services.observability import (
    capture_message,
    new_error_id,
    persist_error,
    sanitize_context,
)

router = APIRouter()


class ClientErrorReport(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    stack: str | None = Field(None, max_length=8000)
    path: str | None = Field(None, max_length=500)
    source: str = Field("frontend", max_length=40)


def _serialize_error(item: ErrorEvent) -> dict:
    return {
        "id": str(item.id),
        "error_id": item.error_id,
        "service": item.service,
        "level": item.level,
        "message": item.message,
        "exception_type": item.exception_type,
        "request_id": item.request_id,
        "user_id": str(item.user_id) if item.user_id else None,
        "path": item.path,
        "method": item.method,
        "status_code": item.status_code,
        "details": item.details or {},
        "resolved_at": item.resolved_at.isoformat() if item.resolved_at else None,
        "created_at": item.created_at.isoformat(),
    }


@router.post("/client-errors", status_code=202)
async def report_client_error(
    body: ClientErrorReport,
    user: User = Depends(get_current_user),
):
    error_id = new_error_id()
    details = sanitize_context({"stack": body.stack, "source": body.source})
    await persist_error(
        error_id=error_id,
        service="frontend",
        message=body.message,
        exception_type="ClientError",
        user_id=user.id,
        path=body.path,
        details=details,
    )
    capture_message(body.message, error_id=error_id, details=details)
    return {"error_id": error_id}


@router.get("/admin/summary")
async def get_observability_summary(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    total = await db.scalar(
        select(func.count(ErrorEvent.id)).where(ErrorEvent.created_at >= since)
    )
    unresolved = await db.scalar(
        select(func.count(ErrorEvent.id)).where(ErrorEvent.resolved_at.is_(None))
    )
    failed_jobs = await db.scalar(
        select(func.count(BackgroundJob.id)).where(
            BackgroundJob.status == "failed",
            BackgroundJob.finished_at >= since,
        )
    )
    service_rows = (
        await db.execute(
            select(ErrorEvent.service, func.count(ErrorEvent.id))
            .where(ErrorEvent.created_at >= since)
            .group_by(ErrorEvent.service)
        )
    ).all()
    hour_bucket = func.date_trunc("hour", ErrorEvent.created_at)
    trend_rows = (
        await db.execute(
            select(
                hour_bucket.label("hour"),
                func.count(ErrorEvent.id).label("count"),
            )
            .where(ErrorEvent.created_at >= since)
            .group_by(hour_bucket)
            .order_by(hour_bucket)
        )
    ).all()
    return {
        "errors_24h": int(total or 0),
        "unresolved": int(unresolved or 0),
        "failed_jobs_24h": int(failed_jobs or 0),
        "by_service": {row[0]: int(row[1]) for row in service_rows},
        "trend": [
            {"hour": row.hour.isoformat(), "count": int(row.count)}
            for row in trend_rows
        ],
    }


@router.get("/admin/errors")
async def list_error_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    service: str | None = Query(None, max_length=40),
    resolved: bool | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    filters = []
    if service:
        filters.append(ErrorEvent.service == service)
    if resolved is not None:
        filters.append(
            ErrorEvent.resolved_at.is_not(None)
            if resolved
            else ErrorEvent.resolved_at.is_(None)
        )
    total = await db.scalar(select(func.count(ErrorEvent.id)).where(*filters))
    items = (
        await db.execute(
            select(ErrorEvent)
            .where(*filters)
            .order_by(ErrorEvent.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()
    return {
        "items": [_serialize_error(item) for item in items],
        "total": int(total or 0),
        "page": page,
        "page_size": page_size,
    }


@router.patch("/admin/errors/{event_id}/resolve")
async def resolve_error_event(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    item = await db.get(ErrorEvent, event_id)
    if not item:
        raise HTTPException(status_code=404, detail="错误记录不存在")
    item.resolved_at = item.resolved_at or datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(item)
    return _serialize_error(item)
