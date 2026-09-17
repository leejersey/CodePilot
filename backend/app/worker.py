"""ARQ worker entrypoint for recoverable long-running jobs."""

import asyncio
import uuid
from datetime import datetime, timezone

from arq import Retry, cron
from arq.connections import RedisSettings
from sqlalchemy import select

from app.core.config import get_settings
from app.db.database import AsyncSessionLocal
from app.models.models import BackgroundJob, KnowledgeDocument, User
from app.services.kb_ingest import process_document
from app.services.llm_usage import LLMUsageLimitError
from app.services.observability import (
    capture_exception,
    configure_sentry,
    configure_structured_logging,
    new_error_id,
    persist_error,
    send_alert,
)
from app.db.redis import get_redis

MAX_JOB_TRIES = 3
configure_structured_logging()
configure_sentry()


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


async def _set_progress(job_id: uuid.UUID, progress: int) -> None:
    async with AsyncSessionLocal() as db:
        job = await db.get(BackgroundJob, job_id)
        if not job or job.status == "cancelled":
            raise asyncio.CancelledError
        if job.status == "processing":
            job.progress = max(job.progress, min(progress, 99))
            await db.commit()


async def _fail(job_id: uuid.UUID, error: Exception, attempt: int) -> None:
    final_failure = attempt >= MAX_JOB_TRIES
    job_type = "unknown"
    user_id = None
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(BackgroundJob).where(BackgroundJob.id == job_id).with_for_update()
        )
        job = result.scalar_one_or_none()
        if not job or job.status == "cancelled":
            return
        job.status = "failed" if final_failure else "retrying"
        job.error_message = str(error)[:1000]
        job.finished_at = datetime.now(timezone.utc) if final_failure else None
        job_type = job.job_type
        user_id = job.user_id
        await db.commit()
    if final_failure:
        error_id = new_error_id()
        capture_exception(error, error_id=error_id)
        await persist_error(
            error_id=error_id,
            service="worker",
            message=str(error) or type(error).__name__,
            exception_type=type(error).__name__,
            user_id=user_id,
            details={"job_id": str(job_id), "job_type": job_type, "attempt": attempt},
        )
        await send_alert(
            "CodePilot 后台任务失败",
            f"{job_type} 任务重试 {attempt} 次后失败",
            dedup_key=f"job:{job_type}:{type(error).__name__}",
            details={"job_id": str(job_id), "error_id": error_id},
        )


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
    except LLMUsageLimitError as exc:
        await _fail(job_uuid, exc, MAX_JOB_TRIES)
        raise
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
    except LLMUsageLimitError as exc:
        await _fail(job_uuid, exc, MAX_JOB_TRIES)
        raise
    except Exception as exc:
        await _fail(job_uuid, exc, attempt)
        if attempt < MAX_JOB_TRIES:
            raise Retry(defer=2 ** attempt) from exc
        raise
    except asyncio.CancelledError as exc:
        await _fail(job_uuid, RuntimeError("出题任务被中断"), MAX_JOB_TRIES)
        raise exc


async def generate_path_job(ctx: dict, job_id: str) -> None:
    from app.api.v1.paths import generate_path_record

    job_uuid = uuid.UUID(job_id)
    attempt = int(ctx.get("job_try", 1))
    job = await _start(job_uuid, attempt)
    if not job:
        return
    try:
        async with AsyncSessionLocal() as db:
            user = await db.get(User, job.user_id)
            if not user:
                raise ValueError("任务创建者不存在")

            async def report(progress: int) -> None:
                await _set_progress(job_uuid, progress)

            path = await asyncio.wait_for(
                generate_path_record(db, job.payload or {}, user, report),
                timeout=540,
            )
            current_job = await db.get(BackgroundJob, job_uuid)
            if not current_job or current_job.status == "cancelled":
                await db.rollback()
                return
            current_job.status = "completed"
            current_job.progress = 100
            current_job.result_resource_id = path.id
            current_job.finished_at = datetime.now(timezone.utc)
            await db.commit()
    except LLMUsageLimitError as exc:
        await _fail(job_uuid, exc, MAX_JOB_TRIES)
        raise
    except Exception as exc:
        await _fail(job_uuid, exc, attempt)
        if attempt < MAX_JOB_TRIES:
            raise Retry(defer=2 ** attempt) from exc
        raise
    except asyncio.CancelledError as exc:
        await _fail(job_uuid, RuntimeError("路径生成任务被中断"), MAX_JOB_TRIES)
        raise exc


async def _run_course_job(ctx: dict, job_id: str, *, rebuild: bool) -> None:
    from app.services.course_generation import (
        generate_course_record,
        rebuild_course_record,
    )

    job_uuid = uuid.UUID(job_id)
    attempt = int(ctx.get("job_try", 1))
    job = await _start(job_uuid, attempt)
    if not job:
        return
    try:
        async with AsyncSessionLocal() as db:
            user = await db.get(User, job.user_id)
            if not user:
                raise ValueError("任务创建者不存在")

            async def report(progress: int) -> None:
                await _set_progress(job_uuid, progress)

            payload = job.payload or {}
            if rebuild:
                course = await asyncio.wait_for(
                    rebuild_course_record(
                        db,
                        uuid.UUID(str(payload["course_id"])),
                        payload,
                        user,
                        report,
                    ),
                    timeout=540,
                )
            else:
                course = await asyncio.wait_for(
                    generate_course_record(db, payload, user, report),
                    timeout=540,
                )
            current_job = await db.get(BackgroundJob, job_uuid)
            if not current_job or current_job.status == "cancelled":
                await db.rollback()
                return
            current_job.status = "completed"
            current_job.progress = 100
            current_job.result_resource_id = course.id
            current_job.finished_at = datetime.now(timezone.utc)
            await db.commit()
            if course.legacy_path_id:
                from app.db.redis import cache_delete

                try:
                    await cache_delete("path", str(course.legacy_path_id))
                    await cache_delete("chapters", str(course.legacy_path_id))
                except Exception:
                    pass
    except LLMUsageLimitError as exc:
        await _fail(job_uuid, exc, MAX_JOB_TRIES)
        raise
    except Exception as exc:
        await _fail(job_uuid, exc, attempt)
        if attempt < MAX_JOB_TRIES:
            raise Retry(defer=2 ** attempt) from exc
        raise
    except asyncio.CancelledError as exc:
        await _fail(job_uuid, RuntimeError("课程生成任务被中断"), MAX_JOB_TRIES)
        raise exc


async def course_generate_job(ctx: dict, job_id: str) -> None:
    await _run_course_job(ctx, job_id, rebuild=False)


async def course_rebuild_job(ctx: dict, job_id: str) -> None:
    await _run_course_job(ctx, job_id, rebuild=True)


async def startup(ctx: dict) -> None:
    from app.services.background_jobs import recover_background_jobs

    await recover_background_jobs()
    await worker_heartbeat(ctx)


async def shutdown(ctx: dict) -> None:
    from app.db.arq import close_arq_pool

    await close_arq_pool()


async def worker_heartbeat(ctx: dict) -> None:
    redis = await get_redis()
    await redis.set("codepilot:worker:heartbeat", datetime.now(timezone.utc).isoformat(), ex=75)


class WorkerSettings:
    functions = [
        process_document_job,
        generate_exercise_job,
        generate_path_job,
        course_generate_job,
        course_rebuild_job,
    ]
    cron_jobs = [cron(worker_heartbeat, second={0, 30})]
    redis_settings = RedisSettings.from_dsn(get_settings().REDIS_URL)
    max_jobs = 4
    job_timeout = 600
    keep_result = 3600
    allow_abort_jobs = True
    on_startup = startup
    on_shutdown = shutdown
