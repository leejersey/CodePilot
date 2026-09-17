"""学习进度追踪 API"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import Select, case, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.core.deps import get_current_user
from app.models.models import (
    User,
    LearningPath,
    Chapter,
    ChapterProgress,
    CourseChapter,
    Enrollment,
    Exercise,
    ExerciseSubmission,
    LearningSession,
)
from app.services.learning_analytics import calculate_knowledge_mastery

router = APIRouter()


class _EffectiveChapterState:
    """Chapter status/completed_at as one caller actually experiences them.

    Once a chapter is mapped into a course version, learner state lives in that
    user's ``ChapterProgress`` row and ``Chapter.status`` is frozen at whatever
    the migration found. Only genuinely unmapped personal paths still carry live
    state on ``Chapter`` itself, so analytics have to prefer the per-enrollment
    row and fall back to the shared columns.
    """

    def __init__(self, user_id: uuid.UUID):
        # legacy_chapter_id is globally unique, and enrollments are unique per
        # (user, course), so scoping through active_version_id yields at most
        # one progress row per legacy chapter and cannot fan the outer join out.
        self._scoped = (
            select(
                CourseChapter.legacy_chapter_id.label("legacy_chapter_id"),
                ChapterProgress.status.label("status"),
                ChapterProgress.completed_at.label("completed_at"),
            )
            .select_from(ChapterProgress)
            .join(Enrollment, Enrollment.id == ChapterProgress.enrollment_id)
            .join(
                CourseChapter,
                (CourseChapter.id == ChapterProgress.chapter_id)
                & (CourseChapter.version_id == Enrollment.active_version_id),
            )
            .where(
                Enrollment.user_id == user_id,
                ChapterProgress.version_id == Enrollment.active_version_id,
                CourseChapter.legacy_chapter_id.isnot(None),
            )
            .subquery()
        )
        mapped = self._scoped.c.status.isnot(None)
        self.status = case((mapped, self._scoped.c.status), else_=Chapter.status)
        # completed_at is legitimately NULL on an in-progress enrollment row, so
        # the fallback keys off the join hitting rather than off a NULL value.
        self.completed_at = case(
            (mapped, self._scoped.c.completed_at), else_=Chapter.completed_at
        )

    def join(self, stmt: Select) -> Select:
        """Attach the per-enrollment rows to a statement selecting from Chapter."""
        return stmt.outerjoin(
            self._scoped, self._scoped.c.legacy_chapter_id == Chapter.id
        )


@router.get("/learning-time")
async def get_learning_time(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    total_seconds = await db.scalar(
        select(func.coalesce(func.sum(LearningSession.duration_seconds), 0))
        .where(LearningSession.user_id == user.id)
    )
    today_seconds = await db.scalar(
        select(func.coalesce(func.sum(LearningSession.duration_seconds), 0))
        .where(
            LearningSession.user_id == user.id,
            LearningSession.started_at >= today_start,
        )
    )
    daily_start = today_start - timedelta(days=29)
    rows = (
        await db.execute(
            select(
                func.date(LearningSession.started_at).label("day"),
                func.sum(LearningSession.duration_seconds).label("seconds"),
            )
            .where(
                LearningSession.user_id == user.id,
                LearningSession.started_at >= daily_start,
            )
            .group_by(func.date(LearningSession.started_at))
            .order_by(func.date(LearningSession.started_at))
        )
    ).all()
    by_day = {str(row.day): int(row.seconds or 0) for row in rows}
    daily = [
        {
            "date": str((daily_start + timedelta(days=index)).date()),
            "seconds": by_day.get(str((daily_start + timedelta(days=index)).date()), 0),
        }
        for index in range(30)
    ]
    return {
        "today_seconds": int(today_seconds or 0),
        "total_seconds": int(total_seconds or 0),
        "daily": daily,
    }


@router.get("/weak-points")
async def get_weak_points(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (
        await db.execute(
            select(
                ExerciseSubmission.exercise_id,
                ExerciseSubmission.score,
                ExerciseSubmission.trusted,
                Exercise.tags,
            )
            .join(Exercise, Exercise.id == ExerciseSubmission.exercise_id)
            .where(ExerciseSubmission.user_id == user.id)
            .order_by(ExerciseSubmission.created_at)
        )
    ).all()
    mastery = calculate_knowledge_mastery([
        {
            "exercise_id": str(row.exercise_id),
            "score": row.score,
            "trusted": row.trusted,
            "tags": row.tags,
        }
        for row in rows
    ])
    weak_topics = {item["topic"] for item in mastery if item["weak"]}
    recommendations: dict[str, list[dict]] = {topic: [] for topic in weak_topics}
    if weak_topics:
        exercises = (
            await db.execute(
                select(Exercise)
                .where(Exercise.status == "published")
                .order_by(Exercise.created_at.desc())
            )
        ).scalars().all()
        for exercise in exercises:
            for tag in set(exercise.tags or []) & weak_topics:
                if len(recommendations[tag]) < 3:
                    recommendations[tag].append({
                        "id": str(exercise.id),
                        "title": exercise.title,
                        "chapter_id": str(exercise.chapter_id) if exercise.chapter_id else None,
                    })
    return {
        "knowledge_points": mastery,
        "weak_points": [
            {**item, "recommended_exercises": recommendations.get(item["topic"], [])}
            for item in mastery
            if item["weak"]
        ],
    }


@router.get("/stats")
async def get_progress_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """获取学习进度统计概览"""

    # 1. 学习路线统计
    path_result = await db.execute(
        select(func.count(LearningPath.id))
        .where(LearningPath.user_id == user.id)
    )
    total_paths = path_result.scalar() or 0

    effective = _EffectiveChapterState(user.id)

    # 2. 章节统计
    chapter_result = await db.execute(
        effective.join(
            select(
                func.count(Chapter.id).label("total"),
                func.count(Chapter.id).filter(effective.status == "completed").label("completed"),
                func.count(Chapter.id).filter(effective.status == "in_progress").label("in_progress"),
            )
            .select_from(Chapter)
            .join(LearningPath, Chapter.path_id == LearningPath.id)
        ).where(LearningPath.user_id == user.id)
    )
    ch = chapter_result.one()

    # 3. 练习统计
    exercise_result = await db.execute(
        select(
            func.count(ExerciseSubmission.id).label("total"),
            func.count(ExerciseSubmission.id).filter(ExerciseSubmission.result == "pass").label("passed"),
        )
        .where(ExerciseSubmission.user_id == user.id)
    )
    ex = exercise_result.one()

    # 4. 连续学习天数（最近完成的章节去重按天计算）
    streak_result = await db.execute(
        effective.join(
            select(func.date(effective.completed_at))
            .select_from(Chapter)
            .join(LearningPath, Chapter.path_id == LearningPath.id)
        )
        .where(LearningPath.user_id == user.id)
        .where(effective.completed_at.isnot(None))
        .distinct()
        .order_by(func.date(effective.completed_at).desc())
        .limit(30)
    )
    dates = [row[0] for row in streak_result.all()]

    streak = 0
    if dates:
        from datetime import date, timedelta
        today = date.today()
        # 允许今天或昨天作为起点
        if dates[0] >= today - timedelta(days=1):
            streak = 1
            for i in range(1, len(dates)):
                if dates[i] == dates[i - 1] - timedelta(days=1):
                    streak += 1
                else:
                    break

    return {
        "paths": {
            "total": total_paths,
        },
        "chapters": {
            "total": ch.total,
            "completed": ch.completed,
            "in_progress": ch.in_progress,
            "completion_rate": round(ch.completed / ch.total * 100) if ch.total > 0 else 0,
        },
        "exercises": {
            "total": ex.total,
            "passed": ex.passed,
            "pass_rate": round(ex.passed / ex.total * 100) if ex.total > 0 else 0,
        },
        "streak_days": streak,
    }


@router.get("/paths")
async def get_user_paths(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """获取用户所有学习路线的进度"""
    paths = await db.execute(
        select(LearningPath)
        .where(
            LearningPath.user_id == user.id,
            LearningPath.status != "archived",
        )
        .order_by(LearningPath.updated_at.desc())
    )
    path_rows = paths.scalars().all()
    if not path_rows:
        return []
    effective = _EffectiveChapterState(user.id)
    counts_result = await db.execute(
        effective.join(
            select(
                Chapter.path_id.label("path_id"),
                func.count(Chapter.id).label("total"),
                func.count(Chapter.id).filter(effective.status == "completed").label("completed"),
            )
            .select_from(Chapter)
        )
        .where(Chapter.path_id.in_([path.id for path in path_rows]))
        .group_by(Chapter.path_id)
    )
    counts = {row.path_id: row for row in counts_result.all()}

    result = []
    for path in path_rows:
        ch = counts.get(path.id)
        total = ch.total if ch else 0
        completed = ch.completed if ch else 0
        rag = path.outline.get("rag") if isinstance(path.outline, dict) else None
        if isinstance(rag, dict) and rag.get("source_type"):
            source_type = rag["source_type"]
            kb_names = rag.get("kb_names") or []
        elif isinstance(rag, dict) and rag.get("used"):
            source_type = "knowledge_base"
            kb_names = rag.get("kb_names") or []
        else:
            source_type = "ai_generated"
            kb_names = []
        result.append({
            "id": str(path.id),
            "topic": path.topic,
            "difficulty": path.difficulty,
            "status": path.status,
            "total_chapters": total,
            "completed_chapters": completed,
            "progress": round(completed / total * 100) if total > 0 else 0,
            "source_type": source_type,
            "kb_names": kb_names,
            "created_at": path.created_at.isoformat() if path.created_at else None,
            "updated_at": path.updated_at.isoformat() if path.updated_at else None,
        })

    return result


@router.get("/activity")
async def get_activity_timeline(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """获取最近 30 天学习活动（按天聚合）"""
    from datetime import date, timedelta
    from app.models.models import Message, Conversation

    today = date.today()
    start = today - timedelta(days=29)

    # 每天的消息数（学习活动量）
    result = await db.execute(
        select(
            func.date(Message.created_at).label("day"),
            func.count(Message.id).label("count"),
        )
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(Conversation.user_id == user.id)
        .where(func.date(Message.created_at) >= start)
        .group_by(func.date(Message.created_at))
        .order_by(func.date(Message.created_at))
    )

    activity_map = {str(row.day): row.count for row in result.all()}
    timeline = []
    for i in range(30):
        d = start + timedelta(days=i)
        timeline.append({
            "date": str(d),
            "count": activity_map.get(str(d), 0),
        })

    return timeline


@router.get("/skill-distribution")
async def get_skill_distribution(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """获取技能分布（按主题的章节完成情况）"""
    effective = _EffectiveChapterState(user.id)
    result = await db.execute(
        effective.join(
            select(
                LearningPath.topic,
                func.count(Chapter.id).label("total"),
                func.count(Chapter.id).filter(effective.status == "completed").label("completed"),
            )
            .select_from(Chapter)
            .join(LearningPath, Chapter.path_id == LearningPath.id)
        )
        .where(LearningPath.user_id == user.id)
        .group_by(LearningPath.topic)
    )

    skills = []
    for row in result.all():
        skills.append({
            "topic": row.topic,
            "total": row.total,
            "completed": row.completed,
            "mastery": round(row.completed / row.total * 100) if row.total > 0 else 0,
        })

    return skills

