from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.core.config import get_settings
from app.api.v1 import paths, chapters, conversations, exercises, code, auth, progress, animation, knowledge, settings as user_settings
from app.api.ws import chat

from app.db.redis import get_redis, close_redis
from app.db.database import AsyncSessionLocal
from app.models.models import User

settings = get_settings()


async def _sync_admin_roles() -> None:
    """启动时根据 ADMIN_EMAILS 同步已有用户角色。"""
    emails = settings.admin_email_set
    if not emails:
        return
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User).where(User.email.in_(emails)))
            users = list(result.scalars().all())
            changed = False
            for u in users:
                if u.role != "admin":
                    u.role = "admin"
                    changed = True
            if changed:
                await db.commit()
    except Exception:
        # 启动期失败不阻断服务（例如尚未 migrate）
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    await get_redis()
    await _sync_admin_roles()
    yield
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

# REST API 路由
app.include_router(paths.router, prefix="/api/v1/paths", tags=["Learning Paths"])
app.include_router(chapters.router, prefix="/api/v1/chapters", tags=["Chapters"])
app.include_router(conversations.router, prefix="/api/v1/conversations", tags=["Conversations"])
app.include_router(exercises.router, prefix="/api/v1/exercises", tags=["Exercises"])
app.include_router(code.router, prefix="/api/v1/code", tags=["Code"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(progress.router, prefix="/api/v1/progress", tags=["Progress"])
app.include_router(animation.router, prefix="/api/v1/animation", tags=["Animation"])
app.include_router(knowledge.router, prefix="/api/v1/knowledge-bases", tags=["Knowledge Bases"])
app.include_router(user_settings.router, prefix="/api/v1/settings", tags=["User Settings"])

# WebSocket 路由
app.include_router(chat.router, prefix="/ws", tags=["WebSocket"])


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "version": "0.1.0"}
