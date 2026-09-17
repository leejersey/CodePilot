import logging
import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import (
    get_current_user,
    get_optional_user,
    is_admin_role,
    require_admin,
)
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
    AdminExerciseResponse,
    BackgroundJobResponse,
    ChapterPracticeResponse,
    ExerciseGenerateRequest,
    GeneratedExerciseData,
    ExerciseResponse,
    ExerciseSourceKb,
    ExerciseStatusUpdate,
    ExerciseSubmitRequest,
    ExerciseUpdateRequest,
    ExerciseValidationResponse,
    SubmissionResponse,
)
from app.services.background_jobs import create_and_enqueue_job
from app.services.course_access import can_access_legacy_chapter
from app.services.exercise import generate_exercise, judge_submission
from app.services.judge0 import JudgeUnavailable, run_test_cases
from app.services.kb_retrieve import (
    filter_kbs_relevant_to_topic,
    get_kb_snippets_for_outline,
    list_platform_ready_kb_ids,
    load_kbs_by_ids,
)
from app.services.llm import llm_user_context

logger = logging.getLogger(__name__)
router = APIRouter()


def build_chapter_practice_items(
    exercises: list[Exercise],
    submissions: list[ExerciseSubmission],
) -> dict[uuid.UUID, dict]:
    status_by_exercise = {
        exercise.id: {
            "attempted": False,
            "passed": False,
            "best_score": None,
        }
        for exercise in exercises
    }
    for submission in submissions:
        status = status_by_exercise.get(submission.exercise_id)
        if status is None:
            continue
        status["attempted"] = True
        if submission.score is not None:
            current_best = status["best_score"]
            status["best_score"] = max(current_best or 0, submission.score)
        if submission.result == "pass" and bool(submission.trusted):
            status["passed"] = True
    return status_by_exercise


def _public_exercise(exercise: Exercise) -> dict:
    payload = ExerciseResponse.model_validate(exercise).model_dump()
    payload["test_cases"] = [
        case for case in (payload.get("test_cases") or []) if not case.get("hidden")
    ]
    return payload


def submission_response(submission: ExerciseSubmission) -> SubmissionResponse:
    safe_results = []
    for item in submission.test_results or []:
        if item.get("hidden"):
            safe_results.append({
                key: item[key]
                for key in ("case", "passed", "hidden", "status", "time", "memory")
                if key in item
            })
        else:
            safe_results.append(dict(item))
    return SubmissionResponse(
        submission_id=submission.id,
        submitted_code=submission.submitted_code,
        result=submission.result,
        score=submission.score,
        ai_feedback=submission.ai_feedback,
        test_results=safe_results,
        execution_time=submission.execution_time,
        memory=submission.memory,
        judge_source=submission.judge_source,
        trusted=submission.trusted,
        created_at=submission.created_at,
    )


def exercise_content_hash(exercise: Exercise) -> str:
    content = {
        "title": exercise.title,
        "description": exercise.description,
        "language": exercise.language,
        "difficulty": exercise.difficulty,
        "starter_code": exercise.starter_code or "",
        "reference_solution": exercise.reference_solution or "",
        "test_cases": exercise.test_cases or [],
    }
    canonical = json.dumps(content, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def validate_generated_exercise(exercise: Exercise) -> dict:
    """Validate a generated solution, preserving LLM fallback as untrusted."""
    validation = await judge_submission(
        exercise.description,
        list(exercise.test_cases or []),
        exercise.reference_solution or "",
        exercise.language,
    )
    if not validation.get("trusted"):
        exercise.validation_status = "unverified"
        exercise.validation_hash = None
        exercise.validated_at = None
    elif validation.get("result") == "pass":
        exercise.validation_status = "verified"
        exercise.validation_hash = exercise_content_hash(exercise)
        exercise.validated_at = datetime.now(timezone.utc)
    else:
        exercise.validation_status = "failed"
        exercise.validation_hash = None
        exercise.validated_at = None
    return validation


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
    return [_public_exercise(exercise) for exercise in result.scalars().all()]


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


@router.get("/admin/{exercise_id}", response_model=AdminExerciseResponse)
async def admin_get_exercise(
    exercise_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    exercise = await db.get(Exercise, exercise_id)
    if not exercise:
        raise HTTPException(status_code=404, detail="练习不存在")
    return exercise


@router.put("/admin/{exercise_id}", response_model=AdminExerciseResponse)
async def admin_update_exercise(
    exercise_id: uuid.UUID,
    body: ExerciseUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    exercise = await db.get(Exercise, exercise_id)
    if not exercise:
        raise HTTPException(status_code=404, detail="练习不存在")
    for field, value in body.model_dump().items():
        setattr(exercise, field, value)
    exercise.language = body.language.lower()
    exercise.validation_status = "unverified"
    exercise.validation_hash = None
    exercise.validated_at = None
    if exercise.status == "published":
        exercise.status = "draft"
    await db.commit()
    await db.refresh(exercise)
    return exercise


@router.post("/admin/{exercise_id}/validate", response_model=ExerciseValidationResponse)
async def admin_validate_exercise(
    exercise_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    exercise = await db.get(Exercise, exercise_id)
    if not exercise:
        raise HTTPException(status_code=404, detail="练习不存在")
    if not exercise.reference_solution or not exercise.test_cases:
        raise HTTPException(status_code=422, detail="请先填写参考答案和测试用例")
    validated_hash = exercise_content_hash(exercise)
    try:
        result = await run_test_cases(
            exercise.reference_solution,
            exercise.language,
            list(exercise.test_cases),
        )
    except (httpx.HTTPError, TimeoutError, ValueError, JudgeUnavailable) as exc:
        raise HTTPException(status_code=503, detail=f"Judge0 验证失败: {exc}") from exc
    await db.refresh(exercise, with_for_update=True)
    content_unchanged = exercise_content_hash(exercise) == validated_hash
    valid = result["result"] == "pass" and content_unchanged
    if not content_unchanged:
        return ExerciseValidationResponse(valid=False, **result)
    exercise.validation_status = "verified" if valid else "failed"
    exercise.validation_hash = validated_hash if valid else None
    exercise.validated_at = datetime.now(timezone.utc) if valid else None
    await db.commit()
    return ExerciseValidationResponse(valid=valid, **result)


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


async def generate_exercise_record(
    db: AsyncSession,
    payload: dict,
    admin: User,
) -> Exercise:
    """Worker 内执行 RAG 检索和练习草稿生成。"""
    req = ExerciseGenerateRequest.model_validate(payload)
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
    generated = GeneratedExerciseData.model_validate({
        "title": exercise_data.get("title", "编程练习"),
        "description": exercise_data.get("description", ""),
        "language": req.language,
        "difficulty": req.difficulty,
        "tags": exercise_data.get("tags", []),
        "starter_code": exercise_data.get("starter_code", ""),
        "reference_solution": exercise_data.get("reference_solution", ""),
        "test_cases": exercise_data.get("test_cases", []),
    })

    source_kbs = [{"id": str(kb.id), "name": kb.name} for kb in relevant]
    status = "draft"

    exercise = Exercise(
        chapter_id=req.chapter_id,
        language=generated.language.lower(),
        tags=generated.tags,
        title=generated.title,
        description=generated.description,
        starter_code=generated.starter_code,
        test_cases=[case.model_dump() for case in generated.test_cases],
        reference_solution=generated.reference_solution,
        difficulty=generated.difficulty,
        source_kbs=source_kbs,
        status=status,
        judge_mode="judge0",
        validation_status="unverified",
    )
    db.add(exercise)
    await db.flush()
    if exercise.reference_solution and exercise.test_cases:
        with llm_user_context(admin):
            await validate_generated_exercise(exercise)
    await db.flush()
    return exercise


@router.post("/generate", response_model=BackgroundJobResponse, status_code=202)
async def generate_exercise_endpoint(
    req: ExerciseGenerateRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """将 RAG 出题加入后台队列，立即返回可轮询任务。"""
    try:
        return await create_and_enqueue_job(
            db,
            user=admin,
            job_type="exercise_generate",
            payload=req.model_dump(mode="json"),
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"出题任务入队失败: {exc}") from exc


@router.patch("/{exercise_id}/status", response_model=ExerciseResponse)
async def update_exercise_status(
    exercise_id: uuid.UUID,
    body: ExerciseStatusUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """管理员发布 / 下架 / 打回草稿。"""
    _ = admin
    result = await db.execute(
        select(Exercise).where(Exercise.id == exercise_id).with_for_update()
    )
    exercise = result.scalar_one_or_none()
    if not exercise:
        raise HTTPException(status_code=404, detail="练习不存在")
    if body.status == "published" and (
        exercise.validation_status != "verified"
        or exercise.validation_hash != exercise_content_hash(exercise)
    ):
        raise HTTPException(status_code=422, detail="参考答案通过全部测试后才能发布")
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
    user: User | None = Depends(get_optional_user),
):
    """获取某章节下已发布练习（与章节可见性一致）。"""
    ch_result = await db.execute(select(Chapter).where(Chapter.id == chapter_id))
    chapter = ch_result.scalar_one_or_none()
    if not chapter or not await can_access_legacy_chapter(db, chapter_id, user):
        raise HTTPException(status_code=404, detail="章节不存在")

    result = await db.execute(
        select(Exercise)
        .where(
            Exercise.chapter_id == chapter_id,
            Exercise.status == "published",
        )
        .order_by(Exercise.created_at)
    )
    return [_public_exercise(exercise) for exercise in result.scalars().all()]


@router.get(
    "/chapter/{chapter_id}/recommendations",
    response_model=ChapterPracticeResponse,
)
async def get_chapter_practice(
    chapter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """获取章节练习、当前用户练习状态及下一章。"""
    chapter_result = await db.execute(
        select(Chapter).where(Chapter.id == chapter_id)
    )
    chapter = chapter_result.scalar_one_or_none()
    if not chapter or not await can_access_legacy_chapter(
        db, chapter_id, user, require_enrollment=True
    ):
        raise HTTPException(status_code=404, detail="章节不存在")

    exercise_result = await db.execute(
        select(Exercise)
        .where(
            Exercise.chapter_id == chapter_id,
            Exercise.status == "published",
        )
        .order_by(Exercise.created_at)
    )
    exercises = list(exercise_result.scalars().all())

    submissions: list[ExerciseSubmission] = []
    if exercises:
        submission_result = await db.execute(
            select(ExerciseSubmission).where(
                ExerciseSubmission.exercise_id.in_(
                    [exercise.id for exercise in exercises]
                ),
                ExerciseSubmission.user_id == user.id,
            )
        )
        submissions = list(submission_result.scalars().all())
    practice_status = build_chapter_practice_items(exercises, submissions)

    next_result = await db.execute(
        select(Chapter).where(
            Chapter.path_id == chapter.path_id,
            Chapter.sort_order == chapter.sort_order + 1,
        )
    )
    next_chapter = next_result.scalar_one_or_none()

    recommendations = []
    for exercise in exercises:
        payload = _public_exercise(exercise)
        payload.update(practice_status[exercise.id])
        recommendations.append(payload)
    return {
        "exercises": recommendations,
        "next_chapter": next_chapter,
    }


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
    return _public_exercise(exercise)


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

    try:
        with llm_user_context(user):
            judgement = await judge_submission(
                exercise.description,
                exercise.test_cases,
                body.code,
                language=exercise.language,
            )
    except (httpx.HTTPError, TimeoutError, ValueError) as exc:
        raise HTTPException(status_code=503, detail=f"真实判题服务暂不可用: {exc}") from exc

    test_results = judgement.get("test_results", [])
    times = [item.get("time") for item in test_results if item.get("time")]
    memories = [item.get("memory") for item in test_results if item.get("memory") is not None]

    submission = ExerciseSubmission(
        exercise_id=exercise_id,
        user_id=user.id,
        submitted_code=body.code,
        result=judgement.get("result", "error"),
        ai_feedback=judgement.get("ai_feedback", ""),
        score=judgement.get("score", 0),
        test_results=test_results,
        execution_time=max(times, default=None),
        memory=max(memories, default=None),
        judge_source=judgement.get("judge_source", "judge0"),
        trusted=bool(judgement.get("trusted", True)),
    )
    db.add(submission)
    await db.flush()
    await db.commit()
    await db.refresh(submission)

    return submission_response(submission)


# ── 提交记录 ──

@router.get("/{exercise_id}/submissions", response_model=list[SubmissionResponse])
async def list_submissions(
    exercise_id: uuid.UUID,
    limit: int = Query(20, ge=1, le=100),
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
        .limit(limit)
    )
    submissions = result.scalars().all()
    return [submission_response(submission) for submission in submissions]
