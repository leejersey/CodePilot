import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models import Chapter
from app.schemas.schemas import (
    ChapterResponse,
    ChapterStatusResponse,
    ChapterStatusUpdate,
    LearningHeartbeatRequest,
    LearningHeartbeatResponse,
)
from app.db.redis import cache_delete
from app.core.deps import get_current_user, get_optional_user
from app.models.models import (
    ChapterProgress,
    CourseChapter,
    Enrollment,
    LearningPath,
    LearningSession,
    User,
)
from app.services.course_access import (
    can_access_legacy_chapter,
    get_mapped_course_for_chapter,
    is_course_manager,
    resolve_legacy_status_target,
    serialize_legacy_chapter,
)
from app.services.skills import load_skill_summaries_for_chapters
from app.services.learning_analytics import countable_heartbeat_seconds
from app.services.learning_docs import build_kb_doc_stages, build_learning_docs_payload

router = APIRouter()


@router.post("/{chapter_id}/heartbeat", response_model=LearningHeartbeatResponse)
async def record_learning_heartbeat(
    chapter_id: uuid.UUID,
    body: LearningHeartbeatRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    chapter = await db.scalar(select(Chapter).where(Chapter.id == chapter_id))
    if not chapter or not await can_access_legacy_chapter(
        db, chapter_id, user, require_enrollment=True
    ):
        raise HTTPException(status_code=404, detail="章节不存在")

    now = datetime.now(timezone.utc)
    session = await db.get(LearningSession, body.session_id) if body.session_id else None
    if (
        not session
        or session.user_id != user.id
        or session.chapter_id != chapter_id
        or session.started_at.astimezone(timezone.utc).date() != now.date()
    ):
        session = LearningSession(
            user_id=user.id,
            chapter_id=chapter_id,
            duration_seconds=0,
            started_at=now,
            last_heartbeat_at=now,
        )
        db.add(session)
        await db.flush()
        counted = 0
    else:
        counted = countable_heartbeat_seconds(
            session.last_heartbeat_at,
            now,
            active=body.active,
        )
        session.duration_seconds += counted
        session.last_heartbeat_at = now
    await db.commit()
    return LearningHeartbeatResponse(
        session_id=session.id,
        counted_seconds=counted,
        session_seconds=session.duration_seconds,
    )


@router.get("/{chapter_id}", response_model=ChapterResponse)
async def get_chapter(
    chapter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    result = await db.execute(select(Chapter).where(Chapter.id == chapter_id))
    chapter = result.scalar_one_or_none()
    if not chapter or not await can_access_legacy_chapter(db, chapter_id, user):
        raise HTTPException(status_code=404, detail="章节不存在")
    mapped_chapter = await db.scalar(
        select(CourseChapter).where(CourseChapter.legacy_chapter_id == chapter_id)
    )
    progress = None
    if user:
        progress = await db.scalar(
            select(ChapterProgress)
            .join(Enrollment, Enrollment.id == ChapterProgress.enrollment_id)
            .join(CourseChapter, CourseChapter.id == ChapterProgress.chapter_id)
            .where(
                Enrollment.user_id == user.id,
                CourseChapter.legacy_chapter_id == chapter_id,
            )
        )
    if mapped_chapter:
        skills_by_chapter = await load_skill_summaries_for_chapters(db, [chapter.id])
        return serialize_legacy_chapter(
            chapter,
            progress,
            mapped=True,
            skills=skills_by_chapter.get(chapter.id, []),
        )
    skills_by_chapter = await load_skill_summaries_for_chapters(db, [chapter.id])
    return serialize_legacy_chapter(
        chapter,
        None,
        mapped=False,
        skills=skills_by_chapter.get(chapter.id, []),
    )


@router.get("/{chapter_id}/learning-docs")
async def get_chapter_learning_docs(
    chapter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """文档学习模式：本章完整讲义，按标题分阶段。"""
    if not await can_access_legacy_chapter(
        db, chapter_id, user, require_enrollment=True
    ):
        raise HTTPException(status_code=404, detail="章节不存在")
    payload = await build_learning_docs_payload(db, chapter_id)
    if not payload:
        raise HTTPException(status_code=404, detail="章节不存在")
    return payload


@router.get("/{chapter_id}/learning-docs/kb/{doc_id}")
async def get_chapter_kb_doc_stages(
    chapter_id: uuid.UUID,
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """知识库原文按标题分阶段。"""
    if not await can_access_legacy_chapter(
        db, chapter_id, user, require_enrollment=True
    ):
        raise HTTPException(status_code=404, detail="章节不存在")
    payload = await build_kb_doc_stages(db, chapter_id, doc_id)
    if payload.get("error"):
        raise HTTPException(status_code=404, detail=payload["error"])
    return payload


@router.patch("/{chapter_id}/status", response_model=ChapterStatusResponse)
async def update_chapter_status(
    chapter_id: uuid.UUID,
    body: ChapterStatusUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Chapter).where(Chapter.id == chapter_id))
    chapter = result.scalar_one_or_none()
    if not chapter or not await can_access_legacy_chapter(
        db, chapter_id, user, require_enrollment=True
    ):
        raise HTTPException(status_code=404, detail="章节不存在")

    mapped_chapter = await db.scalar(
        select(CourseChapter).where(CourseChapter.legacy_chapter_id == chapter_id)
    )
    progress = await db.scalar(
        select(ChapterProgress)
        .join(Enrollment, Enrollment.id == ChapterProgress.enrollment_id)
        .join(CourseChapter, CourseChapter.id == ChapterProgress.chapter_id)
        .where(
            Enrollment.user_id == user.id,
            CourseChapter.legacy_chapter_id == chapter_id,
        )
    )
    mapped_course = (
        await get_mapped_course_for_chapter(db, chapter_id) if mapped_chapter else None
    )
    target = resolve_legacy_status_target(
        legacy_chapter=chapter,
        mapped_chapter=mapped_chapter,
        progress=progress,
        preview=mapped_course is not None and is_course_manager(mapped_course, user),
    )
    if target is None:
        # 作者/管理员预览：没有报名就没有私有进度行可写，共享的 Chapter.status
        # 更不能承接他们的点击。如实返回中立进度，由前端说明未被记录。
        return {**serialize_legacy_chapter(chapter, None, mapped=True), "preview": True}

    target.status = body.status
    target.completed_at = (
        datetime.now(timezone.utc) if body.status == "completed" else None
    )

    if body.status == "completed":
        if progress:
            next_progress = await db.scalar(
                select(ChapterProgress)
                .join(CourseChapter, CourseChapter.id == ChapterProgress.chapter_id)
                .where(
                    ChapterProgress.enrollment_id == progress.enrollment_id,
                    CourseChapter.sort_order == chapter.sort_order + 1,
                )
            )
            if next_progress and next_progress.status == "locked":
                next_progress.status = "unlocked"
        else:
            # Unmapped legacy paths retain their historical shared progress model.
            next_result = await db.execute(
                select(Chapter)
                .where(Chapter.path_id == chapter.path_id)
                .where(Chapter.sort_order == chapter.sort_order + 1)
            )
            next_chapter = next_result.scalar_one_or_none()
            if next_chapter and next_chapter.status == "locked":
                next_chapter.status = "unlocked"

    await db.commit()
    await db.refresh(target)
    await cache_delete("chapters", str(chapter.path_id))

    if progress:
        return {
            "id": chapter.id,
            "path_id": chapter.path_id,
            "sort_order": chapter.sort_order,
            "title": chapter.title,
            "summary": chapter.summary,
            "status": progress.status,
            "completed_at": progress.completed_at,
            "created_at": chapter.created_at,
        }
    return chapter
