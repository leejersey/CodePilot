"""Course authorization, enrollment, and lifecycle rules."""

from datetime import datetime, timezone
import uuid
from typing import Any, Iterable

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import is_admin_role
from app.models.models import (
    Chapter,
    ChapterProgress,
    Conversation,
    Course,
    CourseChapter,
    CourseVersion,
    Enrollment,
    Exercise,
    ExerciseSubmission,
    LearningPath,
    Message,
    User,
)

# 永久删除仅允许尚未进入公开目录的私有状态；已发布请用归档。
DELETABLE_COURSE_STATUSES = frozenset({"draft", "rejected"})


def is_public_course(course: Any) -> bool:
    return course.status == "published" and course.visibility == "published"


def is_course_manager(course: Any, user: Any | None) -> bool:
    """作者与管理员治理课程本身，与是否报名无关。"""
    if user is None:
        return False
    return course.author_id == user.id or is_admin_role(getattr(user, "role", None))


def can_access_course(course: Any, user: Any | None) -> bool:
    if is_public_course(course):
        return True
    return is_course_manager(course, user)


def create_enrollment_progress(
    *,
    user_id: uuid.UUID,
    course_id: uuid.UUID,
    version_id: uuid.UUID,
    chapters: Iterable[CourseChapter],
) -> tuple[Enrollment, list[ChapterProgress]]:
    enrollment = Enrollment(
        user_id=user_id,
        course_id=course_id,
        active_version_id=version_id,
        status="active",
    )
    progress = [
        ChapterProgress.for_enrollment(
            enrollment=enrollment,
            chapter=chapter,
            status="unlocked" if index == 0 else "locked",
        )
        for index, chapter in enumerate(chapters)
    ]
    return enrollment, progress


def resolve_legacy_status_target(
    *,
    legacy_chapter: Chapter,
    mapped_chapter: CourseChapter | None,
    progress: ChapterProgress | None,
    preview: bool = False,
) -> Chapter | ChapterProgress | None:
    """Mapped course status is always enrollment-scoped, never shared legacy state.

    `preview` marks an author/admin who may read the course without enrolling.
    They own no progress row, and writing their clicks into the shared
    ``Chapter.status`` would leak one person's position to every learner, so the
    only coherent target is none at all.
    """
    if mapped_chapter is not None:
        if progress is None:
            if preview:
                return None
            raise HTTPException(status_code=409, detail="请先加入课程再更新学习进度")
        return progress
    return legacy_chapter


def serialize_legacy_chapter(
    chapter: Chapter,
    progress: ChapterProgress | None,
    *,
    mapped: bool,
    skills: list[dict] | None = None,
) -> dict[str, Any]:
    """Serialize legacy shape without exposing mapped shared progress state."""
    if progress is not None:
        status = progress.status
        completed_at = progress.completed_at
    elif mapped:
        status = "unlocked" if chapter.sort_order == 1 else "locked"
        completed_at = None
    else:
        status = chapter.status
        completed_at = chapter.completed_at
    return {
        "id": chapter.id,
        "path_id": chapter.path_id,
        "sort_order": chapter.sort_order,
        "title": chapter.title,
        "summary": chapter.summary,
        "status": status,
        "completed_at": completed_at,
        "created_at": chapter.created_at,
        "skills": list(skills or []),
    }


# Statuses an administrator may publish from without a review round trip.
ADMIN_DIRECT_PUBLISH_STATUSES = frozenset({"draft", "archived"})


def set_course_status(course: Any, status: str) -> None:
    """Visibility is derived from status so the two can never diverge."""
    course.status = status
    course.visibility = "published" if status == "published" else "private"


def require_admin_actor(actor: Any) -> None:
    if not is_admin_role(getattr(actor, "role", None)):
        raise HTTPException(status_code=403, detail="需要管理员权限")


def apply_admin_review(course: Any, reviewer: Any, body: Any) -> None:
    require_admin_actor(reviewer)
    if course.status != "pending_review":
        raise HTTPException(status_code=409, detail="只有待审核课程可以审核")
    if body.decision == "approve" and not course.current_version_id:
        raise HTTPException(status_code=409, detail="课程没有当前版本，无法发布")
    now = datetime.now(timezone.utc)
    course.reviewer_id = reviewer.id
    course.reviewed_at = now
    if body.decision == "approve":
        set_course_status(course, "published")
        course.review_note = (body.note or "").strip() or None
        course.published_at = now
    else:
        set_course_status(course, "rejected")
        course.review_note = body.note.strip()


def _require_publication_consent(course: Any, author_role: str | None) -> None:
    """成员的私有课程必须由作者提交审核，管理员不能单方面公开它。

    迁移过来的个人学习路径同样是私有内容，唯一的公开入口是作者主动提交审核。
    平台自建（管理员作者）课程，以及此前已经过审、只是被归档的课程不受此限。
    """
    if is_admin_role(author_role) or course.reviewer_id is not None:
        return
    raise HTTPException(
        status_code=409,
        detail="该课程是成员的私有内容，需由作者提交审核后才能发布",
    )


def apply_admin_status(
    course: Any,
    reviewer: Any,
    status: str,
    *,
    author_role: str | None = None,
) -> None:
    require_admin_actor(reviewer)
    now = datetime.now(timezone.utc)
    if status == "published":
        if course.status not in ADMIN_DIRECT_PUBLISH_STATUSES:
            raise HTTPException(status_code=409, detail="该课程当前状态不能直接发布")
        _require_publication_consent(course, author_role)
        if not course.current_version_id:
            raise HTTPException(status_code=409, detail="课程没有当前版本，无法发布")
        set_course_status(course, "published")
        course.published_at = now
    elif status == "archived":
        if course.status != "published":
            raise HTTPException(status_code=409, detail="只有已发布课程可以归档")
        set_course_status(course, "archived")
    else:
        raise HTTPException(status_code=422, detail="无效课程状态")
    course.reviewer_id = reviewer.id
    course.reviewed_at = now


def assert_course_can_be_deleted(course: Any, user: Any) -> None:
    """草稿 / 已拒绝可永久删除；已发布须先归档。"""
    if getattr(course, "status", None) not in DELETABLE_COURSE_STATUSES:
        raise HTTPException(
            status_code=409,
            detail="仅草稿或已拒绝的课程可以永久删除；已发布请先归档。",
        )
    if is_admin_role(getattr(user, "role", None)):
        return
    if getattr(course, "author_id", None) == getattr(user, "id", None):
        return
    raise HTTPException(status_code=403, detail="无权删除该课程")


async def purge_legacy_path(db: AsyncSession, path_id: uuid.UUID) -> None:
    """删除学习路线及其章节、练习与对话（调用方已解除 Course.legacy_path_id）。"""
    path = await db.scalar(
        select(LearningPath)
        .where(LearningPath.id == path_id)
    )
    if not path:
        return
    chapter_ids = list(
        (
            await db.execute(select(Chapter.id).where(Chapter.path_id == path_id))
        ).scalars().all()
    )
    if chapter_ids:
        conv_ids = list(
            (
                await db.execute(
                    select(Conversation.id).where(Conversation.chapter_id.in_(chapter_ids))
                )
            ).scalars().all()
        )
        if conv_ids:
            await db.execute(delete(Message).where(Message.conversation_id.in_(conv_ids)))
            await db.execute(delete(Conversation).where(Conversation.id.in_(conv_ids)))

        exercise_ids = list(
            (
                await db.execute(
                    select(Exercise.id).where(Exercise.chapter_id.in_(chapter_ids))
                )
            ).scalars().all()
        )
        if exercise_ids:
            await db.execute(
                delete(ExerciseSubmission).where(
                    ExerciseSubmission.exercise_id.in_(exercise_ids)
                )
            )
            await db.execute(delete(Exercise).where(Exercise.id.in_(exercise_ids)))

        await db.execute(delete(Chapter).where(Chapter.id.in_(chapter_ids)))

    await db.delete(path)


async def delete_course_permanently(
    db: AsyncSession,
    course: Course,
    user: Any,
) -> None:
    assert_course_can_be_deleted(course, user)
    path_id = course.legacy_path_id
    course.current_version_id = None
    course.legacy_path_id = None
    await db.flush()
    await db.delete(course)
    await db.flush()
    if path_id:
        await purge_legacy_path(db, path_id)


async def get_mapped_course_for_path(
    db: AsyncSession, path_id: uuid.UUID
) -> Course | None:
    return await db.scalar(select(Course).where(Course.legacy_path_id == path_id))


async def can_access_legacy_path(
    db: AsyncSession,
    path: LearningPath,
    user: User | None,
) -> bool:
    mapped = await get_mapped_course_for_path(db, path.id)
    if mapped:
        return can_access_course(mapped, user)
    if user is None:
        return False
    return path.user_id == user.id or is_admin_role(getattr(user, "role", None))


async def get_mapped_course_for_chapter(
    db: AsyncSession, legacy_chapter_id: uuid.UUID
) -> Course | None:
    return await db.scalar(
        select(Course)
        .join(CourseVersion, CourseVersion.course_id == Course.id)
        .join(CourseChapter, CourseChapter.version_id == CourseVersion.id)
        .where(CourseChapter.legacy_chapter_id == legacy_chapter_id)
    )


async def can_access_legacy_chapter(
    db: AsyncSession,
    legacy_chapter_id: uuid.UUID,
    user: User | None,
    *,
    require_enrollment: bool = False,
) -> bool:
    if user is None:
        mapped_course = await get_mapped_course_for_chapter(db, legacy_chapter_id)
        return bool(mapped_course and is_public_course(mapped_course))

    row = (
        await db.execute(
            select(Course, Enrollment)
            .join(CourseVersion, CourseVersion.course_id == Course.id)
            .join(CourseChapter, CourseChapter.version_id == CourseVersion.id)
            .outerjoin(
                Enrollment,
                (Enrollment.course_id == Course.id)
                & (Enrollment.user_id == user.id)
                & (Enrollment.status.in_(("active", "completed"))),
            )
            .where(CourseChapter.legacy_chapter_id == legacy_chapter_id)
        )
    ).first()
    if row:
        course, enrollment = row
        if is_course_manager(course, user):
            return True
        return bool(
            is_public_course(course)
            and (enrollment is not None or not require_enrollment)
        )

    legacy_owner = await db.scalar(
        select(LearningPath.user_id)
        .join(Chapter, Chapter.path_id == LearningPath.id)
        .where(Chapter.id == legacy_chapter_id)
    )
    return legacy_owner == user.id
