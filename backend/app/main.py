from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text

from app.core.config import get_settings, validate_runtime_security
from app.api.v1 import admin_users, courses, jobs, observability, paths, chapters, conversations, exercises, code, auth, progress, animation, knowledge, usage, settings as user_settings
from app.api.ws import chat

from app.db.redis import get_redis, close_redis
from app.db.arq import close_arq_pool
from app.db.database import AsyncSessionLocal
from app.models.models import User
from app.services.judge0 import judge0_available
from app.services.background_jobs import recover_background_jobs
from app.services.api_rate_limit import ApiRateLimitMiddleware
from app.services.llm_usage import LLMUsageLimitError
from app.services.observability import (
    configure_sentry,
    configure_structured_logging,
    send_alert,
)
from app.services.observability_middleware import ObservabilityMiddleware

settings = get_settings()
configure_structured_logging()
configure_sentry()


async def _sync_admin_roles() -> None:
    """启动时根据 ADMIN_EMAILS 同步超级管理员角色。"""
    emails = settings.admin_email_set
    if not emails:
        return
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User).where(User.email.in_(emails)))
            users = list(result.scalars().all())
            changed = False
            for u in users:
                if u.role != "super_admin":
                    u.role = "super_admin"
                    u.auth_version = (u.auth_version or 1) + 1
                    changed = True
            if changed:
                await db.commit()
    except Exception:
        # 启动期失败不阻断服务（例如尚未 migrate）
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    validate_runtime_security(settings)
    await get_redis()
    await _sync_admin_roles()
    try:
        await recover_background_jobs()
    except Exception:
        # Redis/DB 临时不可用时仍允许 API 启动，失败任务可由管理端手动重试。
        pass
    yield
    await close_arq_pool()
    await close_redis()


app = FastAPI(
    title="CodePilot API",
    description="AI 编程学习平台后端服务",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS — 允许前端开发服务器访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(ApiRateLimitMiddleware)
app.add_middleware(ObservabilityMiddleware)


@app.exception_handler(LLMUsageLimitError)
async def llm_usage_limit_handler(_, exc: LLMUsageLimitError):
    headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after else {}
    return JSONResponse(
        status_code=429,
        content={"detail": str(exc)},
        headers=headers,
    )

# REST API 路由
app.include_router(paths.router, prefix="/api/v1/paths", tags=["Learning Paths"])
app.include_router(courses.router, prefix="/api/v1/courses", tags=["Courses"])
app.include_router(chapters.router, prefix="/api/v1/chapters", tags=["Chapters"])
app.include_router(conversations.router, prefix="/api/v1/conversations", tags=["Conversations"])
app.include_router(exercises.router, prefix="/api/v1/exercises", tags=["Exercises"])
app.include_router(code.router, prefix="/api/v1/code", tags=["Code"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(progress.router, prefix="/api/v1/progress", tags=["Progress"])
app.include_router(animation.router, prefix="/api/v1/animation", tags=["Animation"])
app.include_router(knowledge.router, prefix="/api/v1/knowledge-bases", tags=["Knowledge Bases"])
app.include_router(user_settings.router, prefix="/api/v1/settings", tags=["User Settings"])
app.include_router(admin_users.router, prefix="/api/v1/admin/users", tags=["Admin Users"])
app.include_router(jobs.router, prefix="/api/v1/jobs", tags=["Background Jobs"])
app.include_router(usage.router, prefix="/api/v1/usage", tags=["LLM Usage"])
app.include_router(observability.router, prefix="/api/v1/observability", tags=["Observability"])

# WebSocket 路由
app.include_router(chat.router, prefix="/ws", tags=["WebSocket"])


async def _readiness_payload() -> tuple[dict, bool]:
    services: dict[str, str] = {}
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        services["postgres"] = "ready"
    except Exception:
        services["postgres"] = "unavailable"
    try:
        redis = await get_redis()
        await redis.ping()
        services["redis"] = "ready"
        services["worker"] = "ready" if await redis.exists("codepilot:worker:heartbeat") else "unavailable"
    except Exception:
        services["redis"] = "unavailable"
        services["worker"] = "unavailable"
    services["judge0"] = "ready" if await judge0_available() else "unavailable"
    required_ready = all(services[name] == "ready" for name in ("postgres", "redis", "worker"))
    return {
        "status": "ok" if required_ready and services["judge0"] == "ready" else "degraded",
        "version": "0.1.0",
        "services": services,
        "monitoring": {
            "sentry": "configured" if settings.SENTRY_DSN else "disabled",
            "webhook_alerts": "configured" if settings.ALERT_WEBHOOK_URL else "disabled",
        },
    }, required_ready


@app.get("/health/live", tags=["Health"])
async def liveness_check():
    return {"status": "ok", "version": "0.1.0"}


@app.get("/health/ready", tags=["Health"])
async def readiness_check():
    payload, ready = await _readiness_payload()
    if not ready:
        await send_alert(
            "CodePilot 依赖服务异常",
            "就绪检查发现必需依赖不可用",
            dedup_key="readiness",
            details=payload["services"],
        )
    return JSONResponse(status_code=200 if ready else 503, content=payload)


@app.get("/health", tags=["Health"])
async def health_check():
    payload, _ = await _readiness_payload()
    return payload
