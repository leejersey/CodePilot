import uuid
import logging
from datetime import datetime, timezone
from collections.abc import Awaitable, Callable
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.core.deps import get_current_user, get_optional_user, is_admin_role, require_admin
from app.models.models import (
    LearningPath,
    Chapter,
    User,
    KnowledgeBase,
    Conversation,
    Message,
    Exercise,
    ExerciseSubmission,
    ChapterProgress,
    Course,
    CourseChapter,
    Enrollment,
)
from app.schemas.schemas import (
    PathGenerateRequest,
    PathResponse,
    ChapterResponse,
    KnowledgeBaseResponse,
    PathKnowledgeBindRequest,
    BackgroundJobResponse,
)
from app.services.background_jobs import create_and_enqueue_job
from app.services.llm import call_llm_json, llm_user_context
from app.services.package_candidates import apply_package_refresh
from app.services.skills import create_skills_for_chapter
from app.services.kb_retrieve import (
    count_ready_documents,
    filter_kbs_relevant_to_topic,
    get_kb_snippets_for_outline,

    list_platform_ready_kb_ids,
    list_ready_document_filenames,
    load_kbs_by_ids,
)
from app.db.redis import cache_get, cache_set, cache_delete
from app.services.course_access import (
    can_access_legacy_path,
    get_mapped_course_for_path,
    serialize_legacy_chapter,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# 课程状态：仅这些状态下删除映射路径不会破坏任何学员的学习入口。
DELETABLE_MAPPED_COURSE_STATES = frozenset({"draft", "rejected"})


def legacy_rebuild_eligibility(
    *,
    path: LearningPath,
    mapped_course: Course | None,
    user: User,
) -> dict:
    """旧版重建入口只对真正私人的、未纳入课程治理的路径开放。"""
    if mapped_course is not None:
        return {
            "can_rebuild": False,
            "reason": "governed_course",
            "mapped_course_id": mapped_course.id,
            "mapped_course_status": mapped_course.status,
        }
    owned = path.user_id == user.id or is_admin_role(getattr(user, "role", None))
    return {
        "can_rebuild": owned,
        "reason": "eligible" if owned else "forbidden",
        "mapped_course_id": None,
        "mapped_course_status": None,
    }


def _governed_course_conflict(course: Course, action: str) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail=(
            f"该学习路线已纳入课程治理（课程 {course.id}，状态 {course.status}），"
            f"旧版{action}入口已停用。请改用受管流程 "
            f"POST /api/v1/courses/{course.id}/rebuild，"
            "以便校验发布权限、保留学员进度并留下版本审计记录。"
        ),
    )


def _attach_rag_provenance(
    outline: dict,
    *,
    kbs: list[KnowledgeBase],
    doc_filenames: list[str],
    rag_context_ok: bool,
) -> dict:
    """写入大纲溯源，供前端区分知识库课 / AI 课。"""
    used = bool(rag_context_ok and kbs and doc_filenames)

    covered: set[str] = set()
    for ch in outline.get("chapters") or []:
        if not isinstance(ch, dict):
            continue
        for name in ch.get("covers") or []:
            if isinstance(name, str) and name.strip():
                covered.add(name.strip())

    uncovered: list[str] = []
    if used:
        for fn in doc_filenames:
            if fn in covered:
                continue
            stem = fn.rsplit(".", 1)[0]
            # 标题/摘要中出现文件名关键片段也算覆盖
            hit = False
            for ch in outline.get("chapters") or []:
                if not isinstance(ch, dict):
                    continue
                blob = f"{ch.get('title', '')} {ch.get('summary', '')}"
                if stem and stem in blob:
                    hit = True
                    break
                # 取阶段关键字，如「第一阶段」「Playwright」
                for token in stem.replace("：", " ").replace(":", " ").split():
                    if len(token) >= 4 and token in blob:
                        hit = True
                        break
                if hit:
                    break
            if not hit:
                uncovered.append(fn)

    outline["rag"] = {
        "used": used,
        "source_type": "knowledge_base" if used else "ai_generated",
        "kb_ids": [str(kb.id) for kb in kbs],
        "kb_names": [kb.name for kb in kbs],
        "doc_count": len(doc_filenames),
        "doc_filenames": doc_filenames,
        "uncovered_docs": uncovered,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    return outline


async def _generate_outline(
    topic: str,
    difficulty: str,
    user_background: str,
    kb_context: str = "",
    doc_count: int = 0,
) -> dict:
    """调用 LLM：先基于 RAG/目录总结出新大纲，再按大纲落章节。"""
    if kb_context:
        # 文档多则允许更多章，避免把专题挤掉；仍设上限防止过碎
        min_ch = max(4, min(doc_count, 6)) if doc_count else 4
        max_ch = max(min_ch, min(max(doc_count, 6), 12)) if doc_count else 8
        kb_section = f"""

【流程】请严格按两步思考（只输出最终 JSON，不要输出思考过程）：
A. 阅读知识库目录、必须覆盖清单与检索片段，总结出一套面向学员的新大纲（可合并相近资料，但不得遗漏主要阶段与专题）。
B. 把大纲拆成可顺序学习的 chapters。

【重要】平台已提供知识库。你必须依据资料设计课程，禁止生成与资料无关的通用 Python/编程大纲。
要求：
1. 章节顺序应跟随知识库文档的阶段编号/文件名顺序（如 01→02→…→专题）。
2. 相近文档可以合并为一章（例如同一阶段下的多份进阶文），合并后 summary 需点名被合并的内容。
3. 「专题」类文档（如 Playwright）必须单独成章或明确写入某一章 title/summary，不得省略。
4. 每章 summary 用 2–4 句概括该章对应知识库要点，便于后续 RAG 授课。
5. chapters 数量建议 {min_ch}-{max_ch}（ready 文档约 {doc_count} 份）；total_chapters 必须等于 chapters 数组长度。
6. 每章可附带 covers 字段：列出该章覆盖的知识库文件名（来自目录）。

知识库资料如下：
{kb_context}
"""
        chapter_range_hint = f"{min_ch}-{max_ch}"
    else:
        kb_section = ""
        chapter_range_hint = "3-7"

    prompt = f"""你是一位编程教育专家。请为用户生成一个结构化的学习路线大纲。

主题: {topic}
难度: {difficulty}
用户背景: {user_background or "无特殊背景"}
{kb_section}
请以纯 JSON 格式返回以下结构：
{{
  "total_chapters": <章节数量，建议 {chapter_range_hint}>,
  "estimated_hours": <预计学习时长>,
  "prerequisites": ["前置知识1", "前置知识2"],
  "chapters": [
    {{
      "order": 1,
      "title": "章节标题",
      "summary": "章节概述",
      "covers": ["可选：覆盖的知识库文件名"],
      "skills": [
        {{
          "title": "技能标题（可观察的小目标）",
          "goal": "一句话学习目标",
          "objectives": ["可观测结果1", "可观测结果2"],
          "estimated_minutes": 20
        }}
      ]
    }},
    ...
  ]
}}

额外要求：每章 skills 数组必须有 3～6 个技能，按学习顺序排列；技能应比章节更细，便于逐个过关。"""
    outline = await call_llm_json(
        prompt, request_type="path_generate"
    )
    chapters = outline.get("chapters") or []
    if isinstance(chapters, list) and chapters:
        # 规范化 order，并与 total_chapters 对齐
        for i, ch in enumerate(chapters, 1):
            if isinstance(ch, dict):
                ch["order"] = i
        outline["chapters"] = chapters
        outline["total_chapters"] = len(chapters)
    return outline


@router.post("/generate", response_model=BackgroundJobResponse, status_code=202)
async def generate_path(
    req: PathGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """创建异步学习路径生成任务。"""
    return await create_and_enqueue_job(
        db,
        user=user,
        job_type="path_generate",
        payload=req.model_dump(mode="json"),
    )


async def generate_path_record(
    db: AsyncSession,
    payload: dict,
    user: User,
    progress: Callable[[int], Awaitable[None]] | None = None,
) -> LearningPath:
    """调用 LLM 生成学习路线；仅当存在与主题相关的平台知识库时才走 RAG"""
    req = PathGenerateRequest.model_validate(payload)
    if progress:
        await progress(20)
    all_ids = await list_platform_ready_kb_ids(db)
    all_kbs = await load_kbs_by_ids(db, all_ids)
    kbs, doc_filenames = await filter_kbs_relevant_to_topic(
        db, topic=req.topic, kbs=all_kbs
    )
    if progress:
        await progress(35)
    kb_context = ""
    doc_count = 0
    if kbs:
        try:
            kb_id_list = [kb.id for kb in kbs]
            doc_count = len(doc_filenames)
            kb_context = await get_kb_snippets_for_outline(
                db, kb_ids=kb_id_list, topic=req.topic, top_k=10
            )
        except Exception as e:
            logger.warning(f"KB retrieval for outline failed: {e}")
            kbs = []
            doc_filenames = []
            kb_context = ""

    if progress:
        await progress(50)
    with llm_user_context(user):
        outline = await _generate_outline(
            req.topic,
            req.difficulty,
            req.user_background,
            kb_context=kb_context,
            doc_count=doc_count,
        )
    if progress:
        await progress(80)
    outline = _attach_rag_provenance(
        outline,
        kbs=kbs,
        doc_filenames=doc_filenames,
        rag_context_ok=bool(kb_context.strip()),
    )

    path = LearningPath(
        user_id=user.id,
        topic=req.topic,
        difficulty=req.difficulty,
        outline=outline,
        status="active",
        knowledge_bases=list(kbs),
    )
    db.add(path)
    await db.flush()

    legacy_chapters: list[Chapter] = []
    skills_by_chapter: dict[uuid.UUID, list] = {}
    for ch in outline.get("chapters", []):
        chapter = Chapter(
            path_id=path.id,
            sort_order=ch["order"],
            title=ch["title"],
            summary=ch.get("summary", ""),
            status="unlocked" if ch["order"] == 1 else "locked",
        )
        db.add(chapter)
        await db.flush()
        skills = await create_skills_for_chapter(
            db, chapter.id, ch, chapter_title=ch.get("title")
        )
        legacy_chapters.append(chapter)
        skills_by_chapter[chapter.id] = skills

    await db.flush()
    apply_package_refresh(
        path,
        legacy_chapters,
        outline=outline,
        chapter_skills=skills_by_chapter,
    )
    if progress:
        await progress(90)

    return path


@router.get("/{path_id}/knowledge-bases", response_model=list[KnowledgeBaseResponse])
async def get_path_knowledge_bases(
    path_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(LearningPath)
        .options(selectinload(LearningPath.knowledge_bases).selectinload(KnowledgeBase.documents))
        .where(LearningPath.id == path_id)
    )
    path = result.scalar_one_or_none()
    if not path or not await can_access_legacy_path(db, path, user):
        raise HTTPException(status_code=404, detail="学习路线不存在")

    return [
        KnowledgeBaseResponse(
            id=kb.id,
            name=kb.name,
            description=kb.description,
            status=kb.status,
            created_at=kb.created_at,
            updated_at=kb.updated_at,
            document_count=len(kb.documents),
        )
        for kb in path.knowledge_bases
    ]


@router.put("/{path_id}/knowledge-bases", response_model=list[KnowledgeBaseResponse])
async def bind_path_knowledge_bases(
    path_id: uuid.UUID,
    body: PathKnowledgeBindRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """仅管理员可调整路径绑定的平台知识库。"""
    result = await db.execute(
        select(LearningPath)
        .options(selectinload(LearningPath.knowledge_bases))
        .where(LearningPath.id == path_id)
    )
    path = result.scalar_one_or_none()
    if not path:
        raise HTTPException(status_code=404, detail="学习路线不存在")

    kbs = await load_kbs_by_ids(db, body.knowledge_base_ids)
    if body.knowledge_base_ids and len(kbs) != len(list(dict.fromkeys(body.knowledge_base_ids))):
        raise HTTPException(status_code=400, detail="存在无效的知识库")
    path.knowledge_bases = kbs
    await db.commit()

    result = await db.execute(
        select(LearningPath)
        .options(selectinload(LearningPath.knowledge_bases).selectinload(KnowledgeBase.documents))
        .where(LearningPath.id == path_id)
    )
    path = result.scalar_one()
    return [
        KnowledgeBaseResponse(
            id=kb.id,
            name=kb.name,
            description=kb.description,
            status=kb.status,
            created_at=kb.created_at,
            updated_at=kb.updated_at,
            document_count=len(kb.documents),
        )
        for kb in path.knowledge_bases
    ]


@router.get("/{path_id}/rebuild-eligibility")
async def get_path_rebuild_eligibility(
    path_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """告知前端旧版重建入口是否可用，以及是否应改走课程治理流程。"""
    path = await db.scalar(select(LearningPath).where(LearningPath.id == path_id))
    if not path or not await can_access_legacy_path(db, path, user):
        raise HTTPException(status_code=404, detail="学习路线不存在")
    return legacy_rebuild_eligibility(
        path=path,
        mapped_course=await get_mapped_course_for_path(db, path_id),
        user=user,
    )


@router.post("/{path_id}/rebuild-from-kb", response_model=PathResponse)
async def rebuild_path_from_kb(
    path_id: uuid.UUID,
    body: PathKnowledgeBindRequest | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """根据平台知识库重新生成未纳入课程治理的私人路径大纲与章节。"""
    result = await db.execute(
        select(LearningPath)
        .options(selectinload(LearningPath.knowledge_bases), selectinload(LearningPath.chapters))
        .where(LearningPath.id == path_id)
    )
    path = result.scalar_one_or_none()
    if not path:
        raise HTTPException(status_code=404, detail="学习路线不存在")
    mapped_course = await get_mapped_course_for_path(db, path_id)
    if mapped_course is not None:
        # 课程内容只能经 validate_rebuild_permission 把关的受管流程更新。
        raise _governed_course_conflict(mapped_course, "重建")
    if path.user_id != user.id and not is_admin_role(getattr(user, "role", None)):
        raise HTTPException(status_code=403, detail="无权修改该路线")

    old_outline = path.outline
    old_kbs = list(path.knowledge_bases)
    old_chapter_ids = [ch.id for ch in path.chapters]

    # 管理员可指定库；否则仅使用与主题相关的平台 ready 库
    if body and body.knowledge_base_ids and is_admin_role(getattr(user, "role", None)):
        kbs = await load_kbs_by_ids(db, body.knowledge_base_ids)
        doc_filenames = await list_ready_document_filenames(db, [kb.id for kb in kbs])
    else:
        kb_ids = await list_platform_ready_kb_ids(db)
        all_kbs = await load_kbs_by_ids(db, kb_ids)
        kbs, doc_filenames = await filter_kbs_relevant_to_topic(
            db, topic=path.topic, kbs=all_kbs
        )

    if not kbs:
        raise HTTPException(
            status_code=400,
            detail="没有与本课程主题相关的知识库。请上传匹配的资料，或生成纯 AI 课程。",
        )

    path.knowledge_bases = kbs

    kb_ids_for_rag = [kb.id for kb in kbs]
    doc_count = len(doc_filenames)
    kb_context = await get_kb_snippets_for_outline(
        db, kb_ids=kb_ids_for_rag, topic=path.topic, top_k=10
    )
    if not kb_context.strip():
        raise HTTPException(status_code=400, detail="知识库暂无可用于生成的文档（需 status=ready）")

    with llm_user_context(user):
        outline = await _generate_outline(
            path.topic,
            path.difficulty,
            "",
            kb_context=kb_context,
            doc_count=doc_count,
        )
    outline = _attach_rag_provenance(
        outline,
        kbs=kbs,
        doc_filenames=doc_filenames,
        rag_context_ok=True,
    )

    if old_chapter_ids:
        # 旧章节改挂归档快照路径：练习、提交记录与对话历史全部原样保留。
        snapshot = LearningPath(
            user_id=path.user_id,
            topic=f"{path.topic}（历史快照）",
            difficulty=path.difficulty,
            outline=old_outline,
            status="archived",
            knowledge_bases=old_kbs,
        )
        db.add(snapshot)
        await db.flush()
        await db.execute(
            update(Chapter)
            .where(Chapter.id.in_(old_chapter_ids))
            .values(path_id=snapshot.id)
        )
        await db.flush()

    path.outline = outline
    legacy_chapters: list[Chapter] = []
    skills_by_chapter: dict[uuid.UUID, list] = {}
    for ch in outline.get("chapters", []):
        chapter = Chapter(
            path_id=path.id,
            sort_order=ch["order"],
            title=ch["title"],
            summary=ch.get("summary", ""),
            status="unlocked" if ch["order"] == 1 else "locked",
        )
        db.add(chapter)
        await db.flush()
        skills = await create_skills_for_chapter(
            db, chapter.id, ch, chapter_title=ch.get("title")
        )
        legacy_chapters.append(chapter)
        skills_by_chapter[chapter.id] = skills

    await db.flush()
    apply_package_refresh(
        path,
        legacy_chapters,
        outline=outline,
        chapter_skills=skills_by_chapter,
    )
    await db.commit()
    await db.refresh(path)

    try:
        await cache_delete("path", str(path.id))
        await cache_delete("chapters", str(path.id))
    except Exception:
        pass

    return path


@router.delete("/{path_id}", status_code=204)
async def delete_path(
    path_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """删除学习路线及其章节、练习与相关对话。"""
    result = await db.execute(
        select(LearningPath)
        .options(selectinload(LearningPath.chapters))
        .where(LearningPath.id == path_id)
    )
    path = result.scalar_one_or_none()
    if not path:
        raise HTTPException(status_code=404, detail="学习路线不存在")
    mapped_course = await get_mapped_course_for_path(db, path_id)
    if mapped_course is not None:
        # Course.legacy_path_id 是 SET NULL：删除后课程将永久失去学习入口。
        if mapped_course.status not in DELETABLE_MAPPED_COURSE_STATES:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"该学习路线是课程 {mapped_course.id}（状态 {mapped_course.status}）"
                    "的学习入口，删除后课程将永久无法学习。请改用课程归档 / 删除流程。"
                ),
            )
        if not is_admin_role(getattr(user, "role", None)):
            raise HTTPException(
                status_code=403,
                detail="该学习路线已绑定课程，仅管理员可以删除",
            )
    elif path.user_id != user.id and not is_admin_role(getattr(user, "role", None)):
        raise HTTPException(status_code=403, detail="无权删除该路线")

    chapter_ids = [ch.id for ch in path.chapters]
    if chapter_ids:
        conv_result = await db.execute(
            select(Conversation.id).where(Conversation.chapter_id.in_(chapter_ids))
        )
        conv_ids = list(conv_result.scalars().all())
        if conv_ids:
            await db.execute(delete(Message).where(Message.conversation_id.in_(conv_ids)))
            await db.execute(delete(Conversation).where(Conversation.id.in_(conv_ids)))

        ex_result = await db.execute(
            select(Exercise.id).where(Exercise.chapter_id.in_(chapter_ids))
        )
        exercise_ids = list(ex_result.scalars().all())
        if exercise_ids:
            await db.execute(
                delete(ExerciseSubmission).where(
                    ExerciseSubmission.exercise_id.in_(exercise_ids)
                )
            )
            await db.execute(delete(Exercise).where(Exercise.id.in_(exercise_ids)))

        await db.execute(delete(Chapter).where(Chapter.id.in_(chapter_ids)))

    await db.delete(path)
    await db.commit()

    try:
        await cache_delete("path", str(path_id))
        await cache_delete("chapters", str(path_id))
    except Exception:
        pass

    return None


@router.get("/{path_id}", response_model=PathResponse)
async def get_path(
    path_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    """获取学习路线详情（Redis 缓存）"""
    result = await db.execute(select(LearningPath).where(LearningPath.id == path_id))
    path = result.scalar_one_or_none()
    if not path or not await can_access_legacy_path(db, path, user):
        raise HTTPException(status_code=404, detail="学习路线不存在")

    # Authorization always precedes cache access to prevent private-ID leakage.
    try:
        cached = await cache_get("path", str(path_id))
        if cached:
            return cached
    except Exception as e:
        logger.warning(f"Redis cache_get failed for path {path_id}: {e}")

    try:
        await cache_set("path", str(path_id), value={
            "id": str(path.id),
            "user_id": str(path.user_id),
            "topic": path.topic,
            "difficulty": path.difficulty,
            "outline": path.outline,
            "status": path.status,
            "created_at": path.created_at.isoformat() if path.created_at else None,
        }, ttl=600)
    except Exception as e:
        logger.warning(f"Redis cache_set failed for path {path_id}: {e}")

    return path


@router.get("/{path_id}/chapters", response_model=list[ChapterResponse])
async def get_chapters(
    path_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    """获取路线下的所有章节（Redis 缓存）"""
    path = await db.scalar(select(LearningPath).where(LearningPath.id == path_id))
    if not path or not await can_access_legacy_path(db, path, user):
        raise HTTPException(status_code=404, detail="学习路线不存在")
    mapped_course = await db.scalar(
        select(Course).where(Course.legacy_path_id == path_id)
    )

    result = await db.execute(
        select(Chapter).where(Chapter.path_id == path_id).order_by(Chapter.sort_order)
    )
    chapters = list(result.scalars().all())
    if not mapped_course:
        return chapters

    progress_by_chapter = {}
    if user:
        progress_rows = (
            await db.execute(
                select(ChapterProgress, CourseChapter)
                .join(Enrollment, Enrollment.id == ChapterProgress.enrollment_id)
                .join(CourseChapter, CourseChapter.id == ChapterProgress.chapter_id)
                .where(
                    Enrollment.user_id == user.id,
                    Enrollment.course_id == mapped_course.id,
                )
            )
        ).all()
        progress_by_chapter = {
            course_chapter.legacy_chapter_id: progress
            for progress, course_chapter in progress_rows
            if course_chapter.legacy_chapter_id
        }
    return [
        serialize_legacy_chapter(
            chapter,
            progress_by_chapter.get(chapter.id),
            mapped=True,
        )
        for chapter in chapters
    ]
