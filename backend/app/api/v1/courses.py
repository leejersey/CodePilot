import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import (
    get_current_user,
    get_optional_user,
    is_admin_role,
    require_admin,
    require_creator,
)
from app.db.database import get_db
from app.models.models import (
    ChapterProgress,
    Course,
    CourseChapter,
    CourseVersion,
    Enrollment,
    User,
)
from app.schemas.schemas import (
    AdminCourseResponse,
    AdminCourseListResponse,
    BackgroundJobResponse,
    CourseCatalogResponse,
    CourseChapterResponse,
    CourseDetailResponse,
    CourseGenerateRequest,
    CourseRebuildRequest,
    CourseReviewUpdate,
    CourseStatusUpdate,
    CourseSubmitReviewResponse,
    EnrollmentCourseResponse,
    EnrollmentResponse,
)
from app.services.course_access import (
    apply_admin_review,
    apply_admin_status,
    can_access_course,
    create_enrollment_progress,
    is_public_course,
    set_course_status,
)
from app.services.background_jobs import create_and_enqueue_job
from app.services.course_generation import (
    authorize_course_kbs,
    validate_rebuild_permission,
)

router = APIRouter()


async def _course_or_404(
    db: AsyncSession,
    course_id: uuid.UUID,
    *,
    for_update: bool = False,
) -> Course:
    if for_update:
        course = (
            await db.execute(
                select(Course).where(Course.id == course_id).with_for_update()
            )
        ).scalar_one_or_none()
    else:
        course = await db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="课程不存在")
    return course


async def _admin_course_or_404(
    db: AsyncSession,
    course_id: uuid.UUID,
    *,
    for_update: bool = False,
) -> Course:
    query = (
        select(Course)
        .where(Course.id == course_id)
        .options(
            selectinload(Course.current_version).selectinload(
                CourseVersion.knowledge_bases
            )
        )
    )
    if for_update:
        query = query.with_for_update()
    course = (await db.execute(query)).scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="课程不存在")
    return course


def _deny_private() -> None:
    # Use 404 so private course IDs cannot be enumerated.
    raise HTTPException(status_code=404, detail="课程不存在")


@router.get("", response_model=CourseCatalogResponse)
async def list_catalog(
    search: str | None = Query(None, max_length=100),
    difficulty: Literal["beginner", "intermediate", "advanced"] | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    filters = [Course.status == "published", Course.visibility == "published"]
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        filters.append(or_(Course.topic.ilike(pattern), Course.difficulty.ilike(pattern)))
    if difficulty:
        filters.append(Course.difficulty == difficulty)
    total = await db.scalar(select(func.count(Course.id)).where(*filters))
    result = await db.execute(
        select(Course)
        .where(*filters)
        .order_by(Course.published_at.desc(), Course.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return {
        "items": list(result.scalars().all()),
        "total": total or 0,
        "page": page,
        "page_size": page_size,
    }


@router.get("/me/enrollments", response_model=list[EnrollmentCourseResponse])
async def my_enrollments(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.auth_provider == "anonymous":
        raise HTTPException(status_code=403, detail="匿名账号不能查看课程报名")
    progress_counts = (
        select(
            ChapterProgress.enrollment_id.label("enrollment_id"),
            func.count(ChapterProgress.id).label("total_chapters"),
            func.count(ChapterProgress.id)
            .filter(ChapterProgress.status == "completed")
            .label("completed_chapters"),
        )
        .group_by(ChapterProgress.enrollment_id)
        .subquery()
    )
    rows = (
        await db.execute(
            select(
                Enrollment,
                Course,
                func.coalesce(progress_counts.c.total_chapters, 0).label(
                    "total_chapters"
                ),
                func.coalesce(progress_counts.c.completed_chapters, 0).label(
                    "completed_chapters"
                ),
            )
            .join(Course, Course.id == Enrollment.course_id)
            .outerjoin(
                progress_counts,
                progress_counts.c.enrollment_id == Enrollment.id,
            )
            .where(Enrollment.user_id == user.id)
            .order_by(Enrollment.updated_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    response = []
    for row in rows:
        enrollment = row.Enrollment
        course = row.Course
        total = row.total_chapters
        completed = row.completed_chapters
        response.append(
            {
                **EnrollmentResponse.model_validate(enrollment).model_dump(),
                "course": course,
                "learning_path_id": course.learning_path_id,
                "total_chapters": total,
                "completed_chapters": completed,
                "progress": round(completed / total * 100) if total else 0,
            }
        )
    return response


@router.get("/creator/mine", response_model=list[AdminCourseResponse])
async def creator_courses(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_creator),
):
    result = await db.execute(
        select(Course)
        .where(Course.author_id == user.id)
        .options(
            selectinload(Course.current_version).selectinload(
                CourseVersion.knowledge_bases
            )
        )
        .order_by(Course.updated_at.desc())
    )
    return list(result.scalars().all())


@router.post("/generate", response_model=BackgroundJobResponse, status_code=202)
async def generate_course(
    body: CourseGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_creator),
):
    if not body.pure_ai:
        await authorize_course_kbs(db, user, body.knowledge_base_ids)
    return await create_and_enqueue_job(
        db,
        user=user,
        job_type="course_generate",
        payload=body.model_dump(mode="json"),
    )


@router.get("/admin/all", response_model=AdminCourseListResponse)
async def all_courses(
    status: Literal[
        "draft", "pending_review", "rejected", "published", "archived"
    ]
    | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    filters = [Course.status == status] if status else []
    total = await db.scalar(select(func.count(Course.id)).where(*filters))
    result = await db.execute(
        select(Course)
        .where(*filters)
        .options(
            selectinload(Course.current_version).selectinload(
                CourseVersion.knowledge_bases
            )
        )
        .order_by(Course.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return {
        "items": list(result.scalars().all()),
        "total": total or 0,
        "page": page,
        "page_size": page_size,
    }


@router.get("/admin/{course_id}", response_model=AdminCourseResponse)
async def admin_get_course(
    course_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    return await _admin_course_or_404(db, course_id)


@router.patch("/admin/{course_id}/review", response_model=AdminCourseResponse)
async def review_course(
    course_id: uuid.UUID,
    body: CourseReviewUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    course = await _admin_course_or_404(db, course_id, for_update=True)
    apply_admin_review(course, admin, body)
    await db.commit()
    await db.refresh(course)
    return course


@router.patch("/admin/{course_id}/status", response_model=AdminCourseResponse)
async def update_course_status(
    course_id: uuid.UUID,
    body: CourseStatusUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    course = await _admin_course_or_404(db, course_id, for_update=True)
    author_role = await db.scalar(
        select(User.role).where(User.id == course.author_id)
    )
    apply_admin_status(course, admin, body.status, author_role=author_role)
    await db.commit()
    await db.refresh(course)
    return course


@router.post(
    "/{course_id}/rebuild",
    response_model=BackgroundJobResponse,
    status_code=202,
)
async def rebuild_course(
    course_id: uuid.UUID,
    body: CourseRebuildRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_creator),
):
    course = await _course_or_404(db, course_id)
    validate_rebuild_permission(course, user)
    if not body.pure_ai:
        await authorize_course_kbs(db, user, body.knowledge_base_ids)
    return await create_and_enqueue_job(
        db,
        user=user,
        job_type="course_rebuild",
        payload={
            **body.model_dump(mode="json"),
            "course_id": str(course.id),
        },
    )


@router.get("/{course_id}", response_model=CourseDetailResponse)
async def get_course(
    course_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    course = await _course_or_404(db, course_id)
    if not can_access_course(course, user):
        _deny_private()
    return course


@router.get("/{course_id}/chapters", response_model=list[CourseChapterResponse])
async def get_course_chapters(
    course_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    course = await _course_or_404(db, course_id)
    if not can_access_course(course, user):
        _deny_private()
    if not course.current_version_id:
        return []
    chapters = list(
        (
            await db.execute(
                select(CourseChapter)
                .where(CourseChapter.version_id == course.current_version_id)
                .order_by(CourseChapter.sort_order)
            )
        )
        .scalars()
        .all()
    )
    progress_by_chapter = {}
    if user:
        progress = (
            await db.execute(
                select(ChapterProgress)
                .join(Enrollment, Enrollment.id == ChapterProgress.enrollment_id)
                .where(
                    Enrollment.user_id == user.id,
                    Enrollment.course_id == course.id,
                    Enrollment.active_version_id == course.current_version_id,
                )
            )
        ).scalars().all()
        progress_by_chapter = {item.chapter_id: item for item in progress}
    return [
        {
            "id": chapter.id,
            "version_id": chapter.version_id,
            "sort_order": chapter.sort_order,
            "title": chapter.title,
            "summary": chapter.summary,
            "content": chapter.content,
            "status": getattr(progress_by_chapter.get(chapter.id), "status", None),
            "completed_at": getattr(
                progress_by_chapter.get(chapter.id), "completed_at", None
            ),
        }
        for chapter in chapters
    ]


@router.post("/{course_id}/enroll", response_model=EnrollmentResponse)
async def enroll_course(
    course_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.auth_provider == "anonymous":
        raise HTTPException(status_code=403, detail="匿名账号不能报名课程")
    # Enrollment and rebuild serialize on the same course row.
    course = await _course_or_404(db, course_id, for_update=True)
    privileged = course.author_id == user.id or is_admin_role(user.role)
    if not is_public_course(course) and not privileged:
        _deny_private()
    if not course.current_version_id:
        raise HTTPException(status_code=409, detail="课程没有可学习版本")
    existing = await db.scalar(
        select(Enrollment).where(
            Enrollment.user_id == user.id,
            Enrollment.course_id == course.id,
        )
    )
    if existing:
        return existing
    chapters = list(
        (
            await db.execute(
                select(CourseChapter)
                .where(CourseChapter.version_id == course.current_version_id)
                .order_by(CourseChapter.sort_order)
            )
        )
        .scalars()
        .all()
    )
    enrollment, progress = create_enrollment_progress(
        user_id=user.id,
        course_id=course.id,
        version_id=course.current_version_id,
        chapters=chapters,
    )
    try:
        async with db.begin_nested():
            db.add(enrollment)
            db.add_all(progress)
            await db.flush()
    except IntegrityError:
        winner = await db.scalar(
            select(Enrollment).where(
                Enrollment.user_id == user.id,
                Enrollment.course_id == course.id,
            )
        )
        if winner:
            return winner
        raise
    await db.commit()
    await db.refresh(enrollment)
    return enrollment


@router.post(
    "/{course_id}/submit-review",
    response_model=CourseSubmitReviewResponse,
)
async def submit_course_review(
    course_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_creator),
):
    course = await _course_or_404(db, course_id)
    # The author gate protects creators' drafts; administrators already govern
    # every course, so it must not hide other authors' courses from them.
    if course.author_id != user.id and not is_admin_role(user.role):
        _deny_private()
    if course.status not in {"draft", "rejected"}:
        raise HTTPException(status_code=409, detail="该课程当前状态不能提交审核")
    if not course.current_version_id:
        raise HTTPException(status_code=409, detail="课程没有当前版本")
    set_course_status(course, "pending_review")
    course.review_note = None
    course.submitted_for_review_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(course)
    return course
