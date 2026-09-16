import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, is_admin_role, require_admin
from app.db.database import get_db
from app.models.models import (
    Chapter,
    Exercise,
    ExerciseSubmission,
    KnowledgeBase,
    KnowledgeDocument,
    LearningPath,
    User,
)
from app.schemas.schemas import (
    ExerciseGenerateRequest,
    ExerciseResponse,
    ExerciseSourceKb,
    ExerciseStatusUpdate,
    ExerciseSubmitRequest,
    SubmissionResponse,
)
from app.services.exercise import generate_exercise, judge_submission
from app.services.kb_retrieve import (
    filter_kbs_relevant_to_topic,
    get_kb_snippets_for_outline,
    list_platform_ready_kb_ids,
    load_kbs_by_ids,
)
from app.services.llm import llm_user_context

logger = logging.getLogger(__name__)
router = APIRouter()


# ── 学员端：仅已发布 ──

@router.get("", response_model=list[ExerciseResponse])
async def list_exercises(
    language: Optional[str] = Query(None, description="按语言筛选，如 python, javascript, go"),
    difficulty: Optional[str] = Query(None, description="按难度筛选: easy, medium, hard"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """公共练习列表：仅 published。"""
    query = select(Exercise).where(Exercise.status == "published")

    if language:
        query = query.where(Exercise.language == language.lower())
    if difficulty:
        query = query.where(Exercise.difficulty == difficulty.lower())

    query = query.order_by(Exercise.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/languages", response_model=list[str])
async def list_languages(db: AsyncSession = Depends(get_db)):
    """已发布题库中的语言列表。"""
    result = await db.execute(
        select(Exercise.language)
        .where(Exercise.status == "published")
        .distinct()
        .order_by(Exercise.language)
    )
    return [row[0] for row in result.all()]


# ── 管理端 ──

@router.get("/admin", response_model=list[ExerciseResponse])
async def admin_list_exercises(
    status: Optional[str] = Query(None, pattern="^(draft|published|archived)$"),
    language: Optional[str] = Query(None),
    difficulty: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """管理员：查看全部状态的练习。"""
    _ = admin
    query = select(Exercise)
    if status:
        query = query.where(Exercise.status == status)
    if language:
        query = query.where(Exercise.language == language.lower())
    if difficulty:
        query = query.where(Exercise.difficulty == difficulty.lower())
    query = query.order_by(Exercise.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/ready-knowledge-bases", response_model=list[ExerciseSourceKb])
async def list_ready_knowledge_bases_for_exercises(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """管理员出题时可选的平台就绪知识库。"""
    _ = admin
    ready_ids = await list_platform_ready_kb_ids(db)
    if not ready_ids:
        return []
    result = await db.execute(
        select(KnowledgeBase)
        .where(KnowledgeBase.id.in_(ready_ids))
        .order_by(KnowledgeBase.name)
    )
    kbs = list(result.scalars().all())
    counts = await db.execute(
        select(KnowledgeDocument.kb_id, func.count(KnowledgeDocument.id))
        .where(
            KnowledgeDocument.kb_id.in_(ready_ids),
            KnowledgeDocument.status == "ready",
        )
        .group_by(KnowledgeDocument.kb_id)
    )
    count_map = {kb_id: int(n) for kb_id, n in counts.all()}
    return [
        ExerciseSourceKb(
            id=str(kb.id),
            name=f"{kb.name}（{count_map.get(kb.id, 0)} 篇）",
        )
        for kb in kbs
    ]


@router.post("/generate", response_model=ExerciseResponse, status_code=201)
async def generate_exercise_endpoint(
    req: ExerciseGenerateRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """管理员基于知识库 RAG 出题；默认草稿，可选择直接发布。"""
    topic = (req.topic or "").strip()
    if len(topic) < 2:
        raise HTTPException(status_code=422, detail="请填写出题主题（至少 2 个字）")

    chapter_hint = ""
    if req.chapter_id:
        ch_result = await db.execute(
            select(Chapter)
            .options(
                selectinload(Chapter.path).selectinload(LearningPath.knowledge_bases)
            )
            .where(Chapter.id == req.chapter_id)
        )
        chapter = ch_result.scalar_one_or_none()
        if not chapter:
            raise HTTPException(status_code=404, detail="章节不存在")
        chapter_hint = f"{chapter.title}" + (
            f" — {chapter.summary}" if chapter.summary else ""
        )

    ready_ids = set(await list_platform_ready_kb_ids(db))
    requested_ids = list(dict.fromkeys(req.knowledge_base_ids))
    if any(i not in ready_ids for i in requested_ids):
        raise HTTPException(
            status_code=422,
            detail="所选知识库不存在或尚未就绪（需至少一份 ready 文档）",
        )

    kbs = await load_kbs_by_ids(db, requested_ids)
    if not kbs:
        raise HTTPException(status_code=422, detail="请选择至少一个就绪知识库")

    relevance_topic = " ".join(
        part for part in [topic, req.language, chapter_hint] if part
    ).strip()

    relevant, _ = await filter_kbs_relevant_to_topic(
        db, topic=relevance_topic, kbs=kbs
    )
    if not relevant:
        raise HTTPException(
            status_code=422,
            detail="所选知识库与出题语言/主题不匹配，请换库或调整主题",
        )

    try:
        kb_context = await get_kb_snippets_for_outline(
            db,
            kb_ids=[kb.id for kb in relevant],
            topic=relevance_topic,
            top_k=8,
        )
    except Exception as e:
        logger.exception("KB retrieval for exercise failed: %s", e)
        raise HTTPException(status_code=502, detail="知识库检索失败，请稍后重试") from e

    if not (kb_context or "").strip():
        raise HTTPException(
            status_code=422,
            detail="知识库中未检索到与主题相关的内容，请换主题或补充文档后再试",
        )

    with llm_user_context(admin):
        exercise_data = await generate_exercise(
            language=req.language,
            difficulty=req.difficulty,
            topic=topic,
            chapter_hint=chapter_hint,
            kb_context=kb_context,
        )

    source_kbs = [{"id": str(kb.id), "name": kb.name} for kb in relevant]
    status = "published" if req.publish else "draft"

    exercise = Exercise(
        chapter_id=req.chapter_id,
        language=req.language.lower(),
        tags=exercise_data.get("tags", []),
        title=exercise_data.get("title", "编程练习"),
        description=exercise_data.get("description", ""),
        starter_code=exercise_data.get("starter_code", ""),
        test_cases=exercise_data.get("test_cases", []),
        difficulty=req.difficulty,
        source_kbs=source_kbs,
        status=status,
    )
    db.add(exercise)
    await db.flush()
    await db.commit()
    await db.refresh(exercise)
    return exercise


@router.patch("/{exercise_id}/status", response_model=ExerciseResponse)
async def update_exercise_status(
    exercise_id: uuid.UUID,
    body: ExerciseStatusUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """管理员发布 / 下架 / 打回草稿。"""
    _ = admin
    result = await db.execute(select(Exercise).where(Exercise.id == exercise_id))
    exercise = result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="练习不存在")
    exercise.status = body.status
    await db.commit()
    await db.refresh(exercise)
    return exercise


@router.delete("/{exercise_id}", status_code=204)
async def delete_exercise(
    exercise_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """管理员删除练习（含提交记录由 FK 策略决定；此处先删提交再删题）。"""
    _ = admin
    result = await db.execute(select(Exercise).where(Exercise.id == exercise_id))
    exercise = result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="练习不存在")
    await db.execute(
        delete(ExerciseSubmission).where(ExerciseSubmission.exercise_id == exercise_id)
    )
    await db.delete(exercise)
    await db.commit()
    return None


# ── 章节练习（保留兼容） ──

@router.get("/chapter/{chapter_id}", response_model=list[ExerciseResponse])
async def list_exercises_by_chapter(
    chapter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """获取某章节下已发布练习。"""
    ch_result = await db.execute(select(Chapter).where(Chapter.id == chapter_id))
    chapter = ch_result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")

    result = await db.execute(
        select(Exercise)
        .where(
            Exercise.chapter_id == chapter_id,
            Exercise.status == "published",
        )
        .order_by(Exercise.created_at)
    )
    return list(result.scalars().all())


# ── 获取单个练习 ──

@router.get("/{exercise_id}", response_model=ExerciseResponse)
async def get_exercise(
    exercise_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Exercise).where(Exercise.id == exercise_id))
    exercise = result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="练习不存在")
    if exercise.status != "published" and not is_admin_role(getattr(user, "role", None)):
        raise HTTPException(status_code=404, detail="练习不存在或未发布")
    return exercise


# ── 提交代码 ──

@router.post("/{exercise_id}/submit", response_model=SubmissionResponse)
async def submit_code(
    exercise_id: uuid.UUID,
    body: ExerciseSubmitRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """提交代码并由 AI 判题（仅已发布题目）。"""
    result = await db.execute(select(Exercise).where(Exercise.id == exercise_id))
    exercise = result.scalar_one_or_none()
    if not exercise or exercise.status != "published":
        raise HTTPException(status_code=404, detail="练习不存在或未发布")

    with llm_user_context(user):
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


# ── 提交记录 ──

@router.get("/{exercise_id}/submissions", response_model=list[SubmissionResponse])
async def list_submissions(
    exercise_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """获取当前用户对某题的所有提交记录。"""
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
