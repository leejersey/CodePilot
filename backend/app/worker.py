"""ARQ worker entrypoint for recoverable long-running jobs."""

import asyncio
import uuid
from datetime import datetime, timezone

from arq import Retry
from arq.connections import RedisSettings
from sqlalchemy import select

from app.core.config import get_settings
from app.db.database import AsyncSessionLocal
from app.models.models import BackgroundJob, KnowledgeDocument, User
from app.services.kb_ingest import process_document

MAX_JOB_TRIES = 3


async def _start(job_id: uuid.UUID, attempt: int) -> BackgroundJob | None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(BackgroundJob)
            .where(BackgroundJob.id == job_id)
            .with_for_update()
        )
        job = result.scalar_one_or_none()
        if not job or job.status not in {"queued", "retrying"}:
            return None
        job.status = "processing"
        job.progress = 10
        job.attempts = attempt
        job.started_at = job.started_at or datetime.now(timezone.utc)
        job.error_message = None
        await db.commit()
        return job


async def _finish(
    job_id: uuid.UUID,
    *,
    result_resource_id: uuid.UUID | None = None,
) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(BackgroundJob).where(BackgroundJob.id == job_id).with_for_update()
        )
        job = result.scalar_one_or_none()
        if not job or job.status == "cancelled":
            return
        job.status = "completed"
        job.progress = 100
        job.result_resource_id = result_resource_id
        job.finished_at = datetime.now(timezone.utc)
        await db.commit()


async def _fail(job_id: uuid.UUID, error: Exception, attempt: int) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(BackgroundJob).where(BackgroundJob.id == job_id).with_for_update()
        )
        job = result.scalar_one_or_none()
        if not job or job.status == "cancelled":
            return
        job.status = "failed" if attempt >= MAX_JOB_TRIES else "retrying"
        job.error_message = str(error)[:1000]
        job.finished_at = datetime.now(timezone.utc) if attempt >= MAX_JOB_TRIES else None
        await db.commit()


async def process_document_job(ctx: dict, job_id: str) -> None:
    job_uuid = uuid.UUID(job_id)
    attempt = int(ctx.get("job_try", 1))
    job = await _start(job_uuid, attempt)
    if not job:
        return
    doc_id = uuid.UUID(str((job.payload or {})["document_id"]))
    try:
        async with AsyncSessionLocal() as db:
            doc = await db.get(KnowledgeDocument, doc_id)
            if not doc:
                await _fail(job_uuid, ValueError("文档已删除"), MAX_JOB_TRIES)
                return
            await asyncio.wait_for(process_document(db, doc), timeout=540)
            current_job = await db.get(BackgroundJob, job_uuid)
            if not current_job or current_job.status == "cancelled":
                await db.rollback()
                return
            await db.commit()
        await _finish(job_uuid, result_resource_id=doc_id)
    except Exception as exc:
        async with AsyncSessionLocal() as db:
            doc = await db.get(KnowledgeDocument, doc_id)
            if doc:
                doc.status = "failed"
                doc.error_message = str(exc)[:500]
                await db.commit()
        await _fail(job_uuid, exc, attempt)
        if attempt < MAX_JOB_TRIES:
            raise Retry(defer=2 ** attempt) from exc
        raise
    except asyncio.CancelledError as exc:
        await _fail(job_uuid, RuntimeError("文档任务被中断"), MAX_JOB_TRIES)
        raise exc


async def generate_exercise_job(ctx: dict, job_id: str) -> None:
    from app.api.v1.exercises import generate_exercise_record

    job_uuid = uuid.UUID(job_id)
    attempt = int(ctx.get("job_try", 1))
    job = await _start(job_uuid, attempt)
    if not job:
        return
    try:
        async with AsyncSessionLocal() as db:
            admin = await db.get(User, job.user_id)
            if not admin:
                raise ValueError("任务创建者不存在")
            exercise = await asyncio.wait_for(
                generate_exercise_record(db, job.payload or {}, admin),
                timeout=540,
            )
            current_job = await db.get(BackgroundJob, job_uuid)
            if not current_job:
                raise ValueError("后台任务记录不存在")
            current_job.status = "completed"
            current_job.progress = 100
            current_job.result_resource_id = exercise.id
            current_job.finished_at = datetime.now(timezone.utc)
            await db.commit()
    except Exception as exc:
        await _fail(job_uuid, exc, attempt)
        if attempt < MAX_JOB_TRIES:
            raise Retry(defer=2 ** attempt) from exc
        raise
    except asyncio.CancelledError as exc:
        await _fail(job_uuid, RuntimeError("出题任务被中断"), MAX_JOB_TRIES)
        raise exc


async def startup(ctx: dict) -> None:
    from app.services.background_jobs import recover_background_jobs

    await recover_background_jobs()


async def shutdown(ctx: dict) -> None:
    from app.db.arq import close_arq_pool

    await close_arq_pool()


class WorkerSettings:
    functions = [process_document_job, generate_exercise_job]
    redis_settings = RedisSettings.from_dsn(get_settings().REDIS_URL)
    max_jobs = 4
    job_timeout = 600
    keep_result = 3600
    allow_abort_jobs = True
    on_startup = startup
    on_shutdown = shutdown
