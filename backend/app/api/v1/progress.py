"""学习进度追踪 API"""

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.core.deps import get_current_user
from app.models.models import User, LearningPath, Chapter, ExerciseSubmission

router = APIRouter()


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

    # 2. 章节统计
    chapter_result = await db.execute(
        select(
            func.count(Chapter.id).label("total"),
            func.count(Chapter.id).filter(Chapter.status == "completed").label("completed"),
            func.count(Chapter.id).filter(Chapter.status == "in_progress").label("in_progress"),
        )
        .join(LearningPath, Chapter.path_id == LearningPath.id)
        .where(LearningPath.user_id == user.id)
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
        select(func.date(Chapter.completed_at))
        .join(LearningPath, Chapter.path_id == LearningPath.id)
        .where(LearningPath.user_id == user.id)
        .where(Chapter.completed_at.isnot(None))
        .distinct()
        .order_by(func.date(Chapter.completed_at).desc())
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
        .where(LearningPath.user_id == user.id)
        .order_by(LearningPath.updated_at.desc())
    )
    result = []
    for path in paths.scalars().all():
        ch_result = await db.execute(
            select(
                func.count(Chapter.id).label("total"),
                func.count(Chapter.id).filter(Chapter.status == "completed").label("completed"),
            )
            .where(Chapter.path_id == path.id)
        )
        ch = ch_result.one()
        result.append({
            "id": str(path.id),
            "topic": path.topic,
            "difficulty": path.difficulty,
            "status": path.status,
            "total_chapters": ch.total,
            "completed_chapters": ch.completed,
            "progress": round(ch.completed / ch.total * 100) if ch.total > 0 else 0,
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
    result = await db.execute(
        select(
            LearningPath.topic,
            func.count(Chapter.id).label("total"),
            func.count(Chapter.id).filter(Chapter.status == "completed").label("completed"),
        )
        .join(Chapter, Chapter.path_id == LearningPath.id)
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

