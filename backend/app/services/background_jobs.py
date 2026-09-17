"""Persistent background-job creation and ARQ enqueue helpers."""

import uuid
from datetime import datetime, timezone

from arq.jobs import Job, JobStatus
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.arq import get_arq_pool
from app.db.database import AsyncSessionLocal
from app.models.models import BackgroundJob, User

FUNCTION_BY_TYPE = {
    "document_ingest": "process_document_job",
    "exercise_generate": "generate_exercise_job",
    "path_generate": "generate_path_job",
    "course_generate": "course_generate_job",
    "course_rebuild": "course_rebuild_job",
}


async def create_and_enqueue_job(
    db: AsyncSession,
    *,
    user: User,
    job_type: str,
    payload: dict,
) -> BackgroundJob:
    function_name = FUNCTION_BY_TYPE.get(job_type)
    if not function_name:
        raise ValueError(f"未知任务类型: {job_type}")
    job = BackgroundJob(user_id=user.id, job_type=job_type, payload=payload)
    db.add(job)
    await db.commit()
    await db.refresh(job)
    try:
        arq = await get_arq_pool()
        queued = await arq.enqueue_job(function_name, str(job.id), _job_id=str(job.id))
        if not queued:
            raise RuntimeError("任务已存在或入队失败")
        job.arq_job_id = queued.job_id
        await db.commit()
        await db.refresh(job)
        return job
    except Exception as exc:
        job.status = "failed"
        job.error_message = f"任务入队失败: {exc}"[:1000]
        await db.commit()
        raise


async def recover_background_jobs() -> int:
    """Re-enqueue jobs lost from Redis, including stale interrupted workers."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(BackgroundJob).where(
                BackgroundJob.status.in_(["queued", "retrying", "processing"])
            ).with_for_update(skip_locked=True)
        )
        jobs = list(result.scalars().all())
        arq = await get_arq_pool()
        recovered = 0
        for job in jobs:
            function_name = FUNCTION_BY_TYPE.get(job.job_type)
            if not function_name:
                continue
            if job.arq_job_id:
                queue_status = await Job(job.arq_job_id, arq).status()
                if queue_status in {JobStatus.queued, JobStatus.in_progress, JobStatus.deferred}:
                    continue
            queued = await arq.enqueue_job(
                function_name,
                str(job.id),
                _job_id=f"{job.id}:recovery:{uuid.uuid4().hex}",
            )
            if queued:
                job.status = "queued"
                job.progress = 0
                job.arq_job_id = queued.job_id
                job.error_message = None
                recovered += 1
        await db.commit()
        return recovered


async def cancel_document_jobs(
    db: AsyncSession,
    document_ids: list[str],
) -> list[str]:
    if not document_ids:
        return []
    result = await db.execute(
        select(BackgroundJob).where(
            BackgroundJob.job_type == "document_ingest",
            BackgroundJob.payload["document_id"].astext.in_(document_ids),
            BackgroundJob.status.in_(["queued", "processing", "retrying"]),
        ).with_for_update()
    )
    jobs = list(result.scalars().all())
    for job in jobs:
        job.status = "cancelled"
        job.error_message = "文档已删除，任务取消"
        job.finished_at = datetime.now(timezone.utc)
    return [job.arq_job_id for job in jobs if job.arq_job_id]


async def abort_queued_jobs(arq_job_ids: list[str]) -> None:
    if not arq_job_ids:
        return
    try:
        arq = await get_arq_pool()
    except Exception:
        return
    for arq_job_id in arq_job_ids:
        try:
            await Job(arq_job_id, arq).abort(timeout=2)
        except Exception:
            # The committed database cancellation remains authoritative.
            pass
