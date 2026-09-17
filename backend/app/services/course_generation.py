"""Course generation, KB authorization, and atomic version rebuilds."""

from __future__ import annotations

import re
import unicodedata
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Awaitable, Callable, Iterable

from fastapi import HTTPException
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import is_admin_role
from app.models.models import (
    Chapter,
    ChapterProgress,
    Course,
    CourseChapter,
    CourseVersion,
    CourseVersionEvent,
    Enrollment,
    KnowledgeBase,
    KnowledgeDocument,
    LearningPath,
    User,
)
from app.schemas.schemas import CourseGenerateRequest, CourseRebuildRequest
from app.services.kb_retrieve import (
    get_kb_snippets_for_outline,
    list_ready_document_filenames,
)
from app.services.llm import llm_user_context


def can_manage_knowledge_base(kb: KnowledgeBase, user: User) -> bool:
    """作者始终保留对自有知识库的管理权，平台公开也不例外。"""
    return is_admin_role(getattr(user, "role", None)) or kb.user_id == user.id


def can_delete_knowledge_base(kb: KnowledgeBase, user: User) -> bool:
    """平台公开库是共享资产，仅管理员可删除。"""
    if is_admin_role(getattr(user, "role", None)):
        return True
    return kb.user_id == user.id and kb.visibility != "platform_public"


def is_selectable_knowledge_base(kb: KnowledgeBase, user: User) -> bool:
    """审批只决定能否被他人共用；自有库可直接用于自己的私有课程。"""
    if kb.status != "active":
        return False
    if is_admin_role(getattr(user, "role", None)):
        return True
    if kb.user_id == user.id:
        return True
    return kb.visibility == "platform_public" and kb.approval_status == "approved"


def require_course_job_actor(user: User) -> None:
    if getattr(user, "auth_provider", None) == "anonymous" or getattr(
        user, "role", None
    ) not in {"creator", "admin", "super_admin"}:
        raise PermissionError("任务执行者已不具备创作者权限")


def validate_rebuild_permission(course: Course, user: User) -> None:
    admin = is_admin_role(getattr(user, "role", None))
    if not admin and course.author_id != user.id:
        raise HTTPException(status_code=404, detail="课程不存在")
    if admin:
        return
    if course.status == "published":
        raise HTTPException(
            status_code=409,
            detail="已发布课程只能由管理员强制更新；请联系管理员或创建修订课程",
        )
    if course.status not in {"draft", "rejected"}:
        raise HTTPException(
            status_code=409,
            detail="该课程当前状态不能重建，请等待审核或创建修订课程",
        )


async def authorize_course_kbs(
    db: AsyncSession,
    user: User,
    kb_ids: list[uuid.UUID],
) -> list[KnowledgeBase]:
    unique_ids = list(dict.fromkeys(kb_ids))
    if not unique_ids:
        return []
    rows = (
        await db.execute(select(KnowledgeBase).where(KnowledgeBase.id.in_(unique_ids)))
    ).scalars().all()
    by_id = {item.id: item for item in rows}
    if len(by_id) != len(unique_ids):
        raise HTTPException(status_code=400, detail="存在无效的知识库")
    denied = [item for item in rows if not is_selectable_knowledge_base(item, user)]
    if denied:
        raise HTTPException(status_code=403, detail="无权使用所选知识库")
    ready_counts = dict(
        (
            await db.execute(
                select(KnowledgeDocument.kb_id, func.count(KnowledgeDocument.id))
                .where(
                    KnowledgeDocument.kb_id.in_(unique_ids),
                    KnowledgeDocument.status == "ready",
                )
                .group_by(KnowledgeDocument.kb_id)
            )
        ).all()
    )
    if any(not ready_counts.get(kb_id, 0) for kb_id in unique_ids):
        raise HTTPException(status_code=409, detail="所选知识库必须各自包含就绪文档")
    return [by_id[kb_id] for kb_id in unique_ids]


def normalize_chapter_title(title: str) -> str:
    normalized = unicodedata.normalize("NFKC", title).casefold()
    return re.sub(r"[\W_]+", "", normalized, flags=re.UNICODE)


@dataclass(frozen=True)
class MigratedProgress:
    chapter_id: uuid.UUID
    status: str
    completed_at: datetime | None


def migrate_progress_by_title(
    old_progress: Iterable,
    new_chapters: Iterable[CourseChapter],
) -> list[MigratedProgress]:
    old_by_title = {
        normalize_chapter_title(item.title): item
        for item in old_progress
        if normalize_chapter_title(item.title)
    }
    migrated: list[MigratedProgress] = []
    unmatched_seen = False
    for chapter in new_chapters:
        old = old_by_title.get(normalize_chapter_title(chapter.title))
        if old is not None:
            migrated.append(
                MigratedProgress(chapter.id, old.status, old.completed_at)
            )
            continue
        status = "unlocked" if not unmatched_seen else "locked"
        unmatched_seen = True
        migrated.append(MigratedProgress(chapter.id, status, None))
    return migrated


async def _generate_outline_for_request(
    db: AsyncSession,
    req: CourseGenerateRequest | CourseRebuildRequest,
    user: User,
) -> tuple[dict, list[KnowledgeBase], list[str]]:
    # Import the established path generator lazily to avoid duplicating its prompt.
    from app.api.v1.paths import _attach_rag_provenance, _generate_outline

    kbs = (
        []
        if req.pure_ai
        else await authorize_course_kbs(db, user, req.knowledge_base_ids)
    )
    filenames: list[str] = []
    kb_context = ""
    if kbs:
        ids = [item.id for item in kbs]
        filenames = await list_ready_document_filenames(db, ids)
        kb_context = await get_kb_snippets_for_outline(
            db, kb_ids=ids, topic=req.topic or "", top_k=10
        )
        if not kb_context.strip():
            raise ValueError("知识库暂无可用于生成的就绪内容")
    with llm_user_context(user):
        outline = await _generate_outline(
            req.topic or "",
            req.difficulty,
            req.user_background,
            kb_context=kb_context,
            doc_count=len(filenames),
        )
    chapters = outline.get("chapters") or []
    if not chapters:
        raise ValueError("课程生成结果不包含章节")
    outline = _attach_rag_provenance(
        outline,
        kbs=kbs,
        doc_filenames=filenames,
        rag_context_ok=bool(kb_context),
    )
    return outline, kbs, filenames


async def generate_course_record(
    db: AsyncSession,
    payload: dict,
    user: User,
    progress: Callable[[int], Awaitable[None]] | None = None,
) -> Course:
    require_course_job_actor(user)
    req = CourseGenerateRequest.model_validate(payload)
    if progress:
        await progress(20)
    outline, kbs, _ = await _generate_outline_for_request(db, req, user)
    if progress:
        await progress(70)

    path = LearningPath(
        user_id=user.id,
        topic=req.topic,
        difficulty=req.difficulty,
        outline=outline,
        status="active",
        knowledge_bases=list(kbs),
    )
    course = Course(
        author_id=user.id,
        topic=req.topic,
        difficulty=req.difficulty,
        status="draft",
        visibility="private",
    )
    db.add_all([path, course])
    await db.flush()
    course.legacy_path_id = path.id

    version = CourseVersion(
        course_id=course.id,
        version_number=1,
        outline=outline,
        source_type="ai_generated" if req.pure_ai else "knowledge_base",
        created_by=user.id,
        knowledge_bases=list(kbs),
    )
    db.add(version)
    await db.flush()

    course_chapters: list[CourseChapter] = []
    for index, item in enumerate(outline["chapters"], 1):
        legacy = Chapter(
            path_id=path.id,
            sort_order=index,
            title=item["title"],
            summary=item.get("summary", ""),
            status="unlocked" if index == 1 else "locked",
        )
        db.add(legacy)
        await db.flush()
        chapter = CourseChapter(
            version_id=version.id,
            sort_order=index,
            title=item["title"],
            summary=item.get("summary", ""),
            content=item,
            legacy_chapter_id=legacy.id,
        )
        db.add(chapter)
        course_chapters.append(chapter)
    await db.flush()
    course.current_version_id = version.id

    enrollment = Enrollment(
        user_id=user.id,
        course_id=course.id,
        active_version_id=version.id,
        status="active",
    )
    db.add(enrollment)
    await db.flush()
    for index, chapter in enumerate(course_chapters):
        db.add(
            ChapterProgress.for_enrollment(
                enrollment=enrollment,
                chapter=chapter,
                status="unlocked" if index == 0 else "locked",
            )
        )
    db.add(
        CourseVersionEvent(
            course_id=course.id,
            from_version_id=None,
            to_version_id=version.id,
            actor_id=user.id,
            event_type="generated",
            details={"source_type": version.source_type},
        )
    )
    await db.flush()
    if progress:
        await progress(90)
    return course


async def rebuild_course_record(
    db: AsyncSession,
    course_id: uuid.UUID,
    payload: dict,
    user: User,
    progress: Callable[[int], Awaitable[None]] | None = None,
) -> Course:
    require_course_job_actor(user)
    course = (
        await db.execute(select(Course).where(Course.id == course_id))
    ).scalar_one_or_none()
    if not course:
        raise ValueError("课程不存在")
    validate_rebuild_permission(course, user)
    expected_state = (
        course.author_id,
        course.current_version_id,
        course.status,
        course.visibility,
    )

    raw = {**payload, "topic": payload.get("topic") or course.topic}
    req = CourseRebuildRequest.model_validate(raw)
    if progress:
        await progress(20)
    # No persistent state is mutated before generation has completed.
    outline, kbs, _ = await _generate_outline_for_request(db, req, user)
    if progress:
        await progress(60)

    course = (
        await db.execute(
            select(Course)
            .where(Course.id == course_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=409, detail="课程在生成期间已被删除")
    validate_rebuild_permission(course, user)
    current_state = (
        course.author_id,
        course.current_version_id,
        course.status,
        course.visibility,
    )
    if current_state != expected_state:
        raise HTTPException(
            status_code=409,
            detail="课程在生成期间已发生变化，请重新发起重建",
        )

    old_version_id = expected_state[1]
    next_number = (
        await db.scalar(
            select(func.coalesce(func.max(CourseVersion.version_number), 0)).where(
                CourseVersion.course_id == course.id
            )
        )
    ) + 1
    version = CourseVersion(
        course_id=course.id,
        version_number=next_number,
        outline=outline,
        source_type="ai_generated" if req.pure_ai else "knowledge_base",
        created_by=user.id,
        knowledge_bases=list(kbs),
    )
    db.add(version)
    await db.flush()
    new_chapters = [
        CourseChapter(
            version_id=version.id,
            sort_order=index,
            title=item["title"],
            summary=item.get("summary", ""),
            content=item,
        )
        for index, item in enumerate(outline["chapters"], 1)
    ]
    db.add_all(new_chapters)
    await db.flush()

    path = None
    if course.legacy_path_id:
        path = (
            await db.execute(
                select(LearningPath)
                .options(selectinload(LearningPath.knowledge_bases))
                .where(LearningPath.id == course.legacy_path_id)
            )
        ).scalar_one_or_none()
    old_legacy_ids: list[uuid.UUID] = []
    if path:
        old_outline = path.outline
        old_kbs = list(path.knowledge_bases)
        old_legacy_ids = list(
            (
                await db.execute(
                    select(Chapter.id).where(Chapter.path_id == path.id)
                )
            ).scalars().all()
        )
        if old_legacy_ids:
            snapshot = LearningPath(
                user_id=course.author_id,
                topic=f"{path.topic}（历史快照 v{next_number - 1}）",
                difficulty=path.difficulty,
                outline=old_outline,
                status="archived",
                knowledge_bases=old_kbs,
            )
            db.add(snapshot)
            await db.flush()
            await db.execute(
                update(Chapter)
                .where(Chapter.id.in_(old_legacy_ids))
                .values(path_id=snapshot.id)
            )
        for index, chapter in enumerate(new_chapters):
            legacy = Chapter(
                path_id=path.id,
                sort_order=index + 1,
                title=chapter.title,
                summary=chapter.summary,
                status="unlocked" if index == 0 else "locked",
            )
            db.add(legacy)
            await db.flush()
            chapter.legacy_chapter_id = legacy.id

    enrollments = list(
        (
            await db.execute(
                select(Enrollment).where(
                    Enrollment.course_id == course.id,
                    Enrollment.status.in_(("active", "completed")),
                )
            )
        ).scalars().all()
    )
    for enrollment in enrollments:
        old_rows = (
            await db.execute(
                select(ChapterProgress, CourseChapter.title)
                .join(CourseChapter, CourseChapter.id == ChapterProgress.chapter_id)
                .where(ChapterProgress.enrollment_id == enrollment.id)
            )
        ).all()
        old_progress = [
            SimpleProgress(title=title, status=item.status, completed_at=item.completed_at)
            for item, title in old_rows
        ]
        migrated = migrate_progress_by_title(old_progress, new_chapters)
        await db.execute(
            delete(ChapterProgress).where(
                ChapterProgress.enrollment_id == enrollment.id
            )
        )
        enrollment.active_version_id = version.id
        for item in migrated:
            db.add(
                ChapterProgress(
                    enrollment_id=enrollment.id,
                    version_id=version.id,
                    chapter_id=item.chapter_id,
                    status=item.status,
                    completed_at=item.completed_at,
                )
            )

    if path:
        path.outline = outline
        path.knowledge_bases = list(kbs)
    course.current_version_id = version.id
    db.add(
        CourseVersionEvent(
            course_id=course.id,
            from_version_id=old_version_id,
            to_version_id=version.id,
            actor_id=user.id,
            event_type="rebuilt",
            details={
                "source_type": version.source_type,
                "migrated_enrollments": len(enrollments),
            },
        )
    )
    await db.flush()
    if progress:
        await progress(90)
    return course


@dataclass(frozen=True)
class SimpleProgress:
    title: str
    status: str
    completed_at: datetime | None
