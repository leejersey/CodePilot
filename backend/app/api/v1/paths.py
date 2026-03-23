import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.core.deps import get_current_user
from app.models.models import LearningPath, Chapter, User
from app.schemas.schemas import PathGenerateRequest, PathResponse, ChapterResponse
from app.services.llm import call_llm_json
from app.db.redis import cache_get, cache_set, cache_delete

logger = logging.getLogger(__name__)
router = APIRouter()


async def _generate_outline(topic: str, difficulty: str, user_background: str) -> dict:
    """调用 LLM 生成学习路线大纲"""
    prompt = f"""你是一位编程教育专家。请为用户生成一个结构化的学习路线大纲。

主题: {topic}
难度: {difficulty}
用户背景: {user_background or "无特殊背景"}

请以纯 JSON 格式返回以下结构：
{{
  "total_chapters": <章节数量 3-7>,
  "estimated_hours": <预计学习时长>,
  "prerequisites": ["前置知识1", "前置知识2"],
  "chapters": [
    {{"order": 1, "title": "章节标题", "summary": "章节概述"}},
    ...
  ]
}}"""
    return await call_llm_json(prompt)


@router.post("/generate", response_model=PathResponse, status_code=201)
async def generate_path(
    req: PathGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """调用 LLM 生成学习路线"""
    outline = await _generate_outline(req.topic, req.difficulty, req.user_background)

    path = LearningPath(
        user_id=user.id,
        topic=req.topic,
        difficulty=req.difficulty,
        outline=outline,
        status="active",
    )
    db.add(path)
    await db.flush()

    for ch in outline.get("chapters", []):
        chapter = Chapter(
            path_id=path.id,
            sort_order=ch["order"],
            title=ch["title"],
            summary=ch.get("summary", ""),
            status="unlocked" if ch["order"] == 1 else "locked",
        )
        db.add(chapter)

    await db.flush()

    # 缓存路线详情（10 分钟）
    try:
        await cache_set("path", str(path.id), value={
            "id": str(path.id),
            "user_id": str(path.user_id),
            "topic": path.topic,
            "difficulty": path.difficulty,
            "outline": path.outline,
            "status": path.status,
            "created_at": path.created_at.isoformat() if path.created_at else None,
        }, ttl=600)
    except Exception as e:
        logger.warning(f"Redis cache_set failed for generated path {path.id}: {e}")

    return path


@router.get("/{path_id}", response_model=PathResponse)
async def get_path(path_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """获取学习路线详情（Redis 缓存）"""
    # 1. 先查缓存
    try:
        cached = await cache_get("path", str(path_id))
        if cached:
            return cached
    except Exception as e:
        logger.warning(f"Redis cache_get failed for path {path_id}: {e}")

    # 2. 缓存未命中 → 查库
    result = await db.execute(select(LearningPath).where(LearningPath.id == path_id))
    path = result.scalar_one_or_none()
    if not path:
        raise HTTPException(status_code=404, detail="学习路线不存在")

    # 3. 写入缓存（10 分钟）
    try:
        await cache_set("path", str(path_id), value={
            "id": str(path.id),
            "user_id": str(path.user_id),
            "topic": path.topic,
            "difficulty": path.difficulty,
            "outline": path.outline,
            "status": path.status,
            "created_at": path.created_at.isoformat() if path.created_at else None,
        }, ttl=600)
    except Exception as e:
        logger.warning(f"Redis cache_set failed for path {path_id}: {e}")

    return path


@router.get("/{path_id}/chapters", response_model=list[ChapterResponse])
async def get_chapters(path_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """获取路线下的所有章节（Redis 缓存）"""
    # 1. 先查缓存
    try:
        cached = await cache_get("chapters", str(path_id))
        if cached:
            return cached
    except Exception as e:
        logger.warning(f"Redis cache_get failed for chapters of path {path_id}: {e}")

    # 2. 缓存未命中 → 查库
    result = await db.execute(
        select(Chapter).where(Chapter.path_id == path_id).order_by(Chapter.sort_order)
    )
    chapters = result.scalars().all()

    # 3. 写入缓存（5 分钟，章节状态变化时会失效）
    try:
        chapter_list = [
            {
                "id": str(ch.id),
                "path_id": str(ch.path_id),
                "sort_order": ch.sort_order,
                "title": ch.title,
                "summary": ch.summary,
                "status": ch.status,
                "completed_at": ch.completed_at.isoformat() if ch.completed_at else None,
                "created_at": ch.created_at.isoformat() if ch.created_at else None,
            }
            for ch in chapters
        ]
        await cache_set("chapters", str(path_id), value=chapter_list, ttl=300)
    except Exception as e:
        logger.warning(f"Redis cache_set failed for chapters of path {path_id}: {e}")

    return chapters
