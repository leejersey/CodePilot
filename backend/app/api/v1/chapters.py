import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models import Chapter
from app.schemas.schemas import ChapterResponse, ChapterStatusUpdate
from app.db.redis import cache_delete

router = APIRouter()


@router.get("/{chapter_id}", response_model=ChapterResponse)
async def get_chapter(chapter_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Chapter).where(Chapter.id == chapter_id))
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")
    return chapter


@router.patch("/{chapter_id}/status", response_model=ChapterResponse)
async def update_chapter_status(
    chapter_id: uuid.UUID,
    body: ChapterStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Chapter).where(Chapter.id == chapter_id))
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")

    chapter.status = body.status
    if body.status == "completed":
        chapter.completed_at = datetime.now(timezone.utc)

        # 自动解锁下一章
        next_result = await db.execute(
            select(Chapter)
            .where(Chapter.path_id == chapter.path_id)
            .where(Chapter.sort_order == chapter.sort_order + 1)
        )
        next_chapter = next_result.scalar_one_or_none()
        if next_chapter and next_chapter.status == "locked":
            next_chapter.status = "unlocked"

    await db.commit()
    await db.refresh(chapter)

    # 清除章节列表缓存（状态已变化）
    await cache_delete("chapters", str(chapter.path_id))

    return chapter
