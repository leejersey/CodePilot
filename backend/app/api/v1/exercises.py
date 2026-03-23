import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.core.deps import get_current_user
from app.models.models import Exercise, ExerciseSubmission, User, Chapter
from app.schemas.schemas import (
    ExerciseGenerateRequest, ExerciseResponse,
    ExerciseSubmitRequest, SubmissionResponse,
)
from app.services.exercise import generate_exercise, judge_submission

router = APIRouter()


# ── 练习中心：公共题库列表 ──

@router.get("", response_model=list[ExerciseResponse])
async def list_exercises(
    language: Optional[str] = Query(None, description="按语言筛选，如 python, javascript, go"),
    difficulty: Optional[str] = Query(None, description="按难度筛选: easy, medium, hard"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """获取公共练习题列表（支持按语言、难度筛选）"""
    query = select(Exercise)

    if language:
        query = query.where(Exercise.language == language.lower())
    if difficulty:
        query = query.where(Exercise.difficulty == difficulty.lower())

    query = query.order_by(Exercise.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/languages", response_model=list[str])
async def list_languages(db: AsyncSession = Depends(get_db)):
    """获取当前题库中所有可用的编程语言列表"""
    result = await db.execute(
        select(Exercise.language).distinct().order_by(Exercise.language)
    )
    return [row[0] for row in result.all()]


# ── 生成新练习 ──

@router.post("/generate", response_model=ExerciseResponse, status_code=201)
async def generate_exercise_endpoint(
    req: ExerciseGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """调用 LLM 生成练习题（支持按语言/主题独立出题）"""
    exercise_data = await generate_exercise(
        language=req.language,
        difficulty=req.difficulty,
        topic=req.topic,
        chapter_id=str(req.chapter_id) if req.chapter_id else None,
    )

    exercise = Exercise(
        chapter_id=req.chapter_id,
        language=req.language.lower(),
        tags=exercise_data.get("tags", []),
        title=exercise_data.get("title", "编程练习"),
        description=exercise_data.get("description", ""),
        starter_code=exercise_data.get("starter_code", ""),
        test_cases=exercise_data.get("test_cases", []),
        difficulty=req.difficulty,
    )
    db.add(exercise)
    await db.flush()
    await db.commit()
    await db.refresh(exercise)
    return exercise


# ── 获取单个练习 ──

@router.get("/{exercise_id}", response_model=ExerciseResponse)
async def get_exercise(exercise_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Exercise).where(Exercise.id == exercise_id))
    exercise = result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="练习不存在")
    return exercise


# ── 提交代码 ──

@router.post("/{exercise_id}/submit", response_model=SubmissionResponse)
async def submit_code(
    exercise_id: uuid.UUID,
    body: ExerciseSubmitRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """提交代码并由 AI 判题"""
    result = await db.execute(select(Exercise).where(Exercise.id == exercise_id))
    exercise = result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="练习不存在")

    judgement = await judge_submission(
        exercise.description,
        exercise.test_cases,
        body.code,
        language=exercise.language,
    )

    submission = ExerciseSubmission(
        exercise_id=exercise_id,
        user_id=user.id,
        submitted_code=body.code,
        result=judgement.get("result", "error"),
        ai_feedback=judgement.get("ai_feedback", ""),
        score=judgement.get("score", 0),
    )
    db.add(submission)
    await db.flush()
    await db.commit()
    await db.refresh(submission)

    return SubmissionResponse(
        submission_id=submission.id,
        result=submission.result,
        score=submission.score,
        ai_feedback=submission.ai_feedback,
        test_results=judgement.get("test_results"),
    )


# ── 章节练习（保留兼容） ──

@router.get("/chapter/{chapter_id}", response_model=list[ExerciseResponse])
async def list_exercises_by_chapter(
    chapter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """获取某章节下的所有练习题（兼容旧接口）"""
    ch_result = await db.execute(select(Chapter).where(Chapter.id == chapter_id))
    chapter = ch_result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")

    result = await db.execute(
        select(Exercise)
        .where(Exercise.chapter_id == chapter_id)
        .order_by(Exercise.created_at)
    )
    return list(result.scalars().all())


# ── 提交记录 ──

@router.get("/{exercise_id}/submissions", response_model=list[SubmissionResponse])
async def list_submissions(
    exercise_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """获取当前用户对某题的所有提交记录"""
    result = await db.execute(
        select(ExerciseSubmission)
        .where(
            ExerciseSubmission.exercise_id == exercise_id,
            ExerciseSubmission.user_id == user.id,
        )
        .order_by(ExerciseSubmission.created_at.desc())
    )
    submissions = result.scalars().all()
    return [
        SubmissionResponse(
            submission_id=s.id,
            result=s.result,
            score=s.score,
            ai_feedback=s.ai_feedback,
            test_results=None,
        )
        for s in submissions
    ]
