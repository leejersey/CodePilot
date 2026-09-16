"""Persistent background job status and retry API."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_admin
from app.db.arq import get_arq_pool
from app.db.database import get_db
from app.models.models import BackgroundJob, User
from app.schemas.schemas import BackgroundJobResponse
from app.services.background_jobs import FUNCTION_BY_TYPE

router = APIRouter()


def _can_access(user: User, job: BackgroundJob) -> bool:
    return user.role == "super_admin" or job.user_id == user.id


@router.get("", response_model=list[BackgroundJobResponse])
async def list_jobs(
    job_type: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    query = select(BackgroundJob)
    if user.role != "super_admin":
        query = query.where(BackgroundJob.user_id == user.id)
    if job_type:
        query = query.where(BackgroundJob.job_type == job_type)
    if status:
        query = query.where(BackgroundJob.status == status)
    result = await db.execute(query.order_by(BackgroundJob.created_at.desc()).limit(limit))
    return list(result.scalars().all())


@router.get("/{job_id}", response_model=BackgroundJobResponse)
async def get_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    job = await db.get(BackgroundJob, job_id)
    if not job or not _can_access(user, job):
        raise HTTPException(status_code=404, detail="任务不存在")
    return job


@router.post("/{job_id}/retry", response_model=BackgroundJobResponse)
async def retry_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    result = await db.execute(
        select(BackgroundJob)
        .where(BackgroundJob.id == job_id)
        .with_for_update()
    )
    job = result.scalar_one_or_none()
    if not job or not _can_access(user, job):
        raise HTTPException(status_code=404, detail="任务不存在")
    if job.status != "failed":
        raise HTTPException(status_code=409, detail="只有失败任务可以重试")
    function_name = FUNCTION_BY_TYPE.get(job.job_type)
    if not function_name:
        raise HTTPException(status_code=422, detail="此任务不支持重试")
    job.status = "queued"
    job.progress = 0
    job.error_message = None
    job.finished_at = None
    await db.commit()
    try:
        arq = await get_arq_pool()
        queued = await arq.enqueue_job(
            function_name,
            str(job.id),
            _job_id=f"{job.id}:retry:{uuid.uuid4().hex}",
        )
        if not queued:
            raise RuntimeError("任务重新入队失败")
        job.arq_job_id = queued.job_id
    except Exception as exc:
        job.status = "failed"
        job.error_message = str(exc)[:1000]
    await db.commit()
    await db.refresh(job)
    return job
