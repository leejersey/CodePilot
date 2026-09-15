import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.core.deps import get_current_user, require_admin
from app.models.models import (
    LearningPath,
    Chapter,
    User,
    KnowledgeBase,
    Conversation,
    Message,
    Exercise,
    ExerciseSubmission,
)
from app.schemas.schemas import (
    PathGenerateRequest,
    PathResponse,
    ChapterResponse,
    KnowledgeBaseResponse,
    PathKnowledgeBindRequest,
)
from app.services.llm import call_llm_json
from app.services.kb_retrieve import (
    count_ready_documents,
    filter_kbs_relevant_to_topic,
    get_kb_snippets_for_outline,
    list_platform_ready_kb_ids,
    list_ready_document_filenames,
    load_kbs_by_ids,
)
from app.db.redis import cache_get, cache_set, cache_delete

logger = logging.getLogger(__name__)
router = APIRouter()


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
      "covers": ["可选：覆盖的知识库文件名"]
    }},
    ...
  ]
}}"""
    outline = await call_llm_json(prompt)
    chapters = outline.get("chapters") or []
    if isinstance(chapters, list) and chapters:
        # 规范化 order，并与 total_chapters 对齐
        for i, ch in enumerate(chapters, 1):
            if isinstance(ch, dict):
                ch["order"] = i
        outline["chapters"] = chapters
        outline["total_chapters"] = len(chapters)
    return outline


@router.post("/generate", response_model=PathResponse, status_code=201)
async def generate_path(
    req: PathGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """调用 LLM 生成学习路线；仅当存在与主题相关的平台知识库时才走 RAG"""
    all_ids = await list_platform_ready_kb_ids(db)
    all_kbs = await load_kbs_by_ids(db, all_ids)
    kbs, doc_filenames = await filter_kbs_relevant_to_topic(
        db, topic=req.topic, kbs=all_kbs
    )
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

    outline = await _generate_outline(
        req.topic,
        req.difficulty,
        req.user_background,
        kb_context=kb_context,
        doc_count=doc_count,
    )
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

    for ch in outline.get("chapters", []):
        chapter = Chapter(
            path_id=path.id,
            sort_order=ch["order"],
            title=ch["title"],
            summary=ch.get("summary", ""),
            status="unlocked" if ch["order"] == 1 else "locked",
        )
        db.add(chapter)

    await db.commit()
    await db.refresh(path)

    # 缓存路线详情（10 分钟）
    try:
        await cache_set("path", str(path.id), value={
            "id": str(path.id),
            "user_id": str(path.user_id),
            "topic": path.topic,
            "difficulty": path.difficulty,
            "outline": path.outline,
            "status": path.status,
            "created_at": path.created_at.isoformat() if path.created_at else None,
        }, ttl=600)
    except Exception as e:
        logger.warning(f"Redis cache_set failed for generated path {path.id}: {e}")

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
    if not path:
        raise HTTPException(status_code=404, detail="学习路线不存在")
    if path.user_id != user.id:
        raise HTTPException(status_code=403, detail="无权查看该路线的知识库")

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


@router.post("/{path_id}/rebuild-from-kb", response_model=PathResponse)
async def rebuild_path_from_kb(
    path_id: uuid.UUID,
    body: PathKnowledgeBindRequest | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """根据平台知识库重新生成大纲与章节（会替换现有章节）。"""
    result = await db.execute(
        select(LearningPath)
        .options(selectinload(LearningPath.knowledge_bases), selectinload(LearningPath.chapters))
        .where(LearningPath.id == path_id)
    )
    path = result.scalar_one_or_none()
    if not path:
        raise HTTPException(status_code=404, detail="学习路线不存在")
    if path.user_id != user.id and getattr(user, "role", None) != "admin":
        raise HTTPException(status_code=403, detail="无权修改该路线")

    # 管理员可指定库；否则仅使用与主题相关的平台 ready 库
    if body and body.knowledge_base_ids and getattr(user, "role", None) == "admin":
        kbs = await load_kbs_by_ids(db, body.knowledge_base_ids)
        doc_filenames = await list_ready_document_filenames(db, [kb.id for kb in kbs])
    else:
        kb_ids = await list_platform_ready_kb_ids(db)
        all_kbs = await load_kbs_by_ids(db, kb_ids)
        kbs, doc_filenames = await filter_kbs_relevant_to_topic(
            db, topic=path.topic, kbs=all_kbs
        )

    path.knowledge_bases = kbs

    if not kbs:
        raise HTTPException(
            status_code=400,
            detail="没有与本课程主题相关的知识库。请上传匹配的资料，或生成纯 AI 课程。",
        )

    kb_ids_for_rag = [kb.id for kb in kbs]
    doc_count = len(doc_filenames)
    kb_context = await get_kb_snippets_for_outline(
        db, kb_ids=kb_ids_for_rag, topic=path.topic, top_k=10
    )
    if not kb_context.strip():
        raise HTTPException(status_code=400, detail="知识库暂无可用于生成的文档（需 status=ready）")

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

    old_chapter_ids = [ch.id for ch in path.chapters]
    if old_chapter_ids:
        await db.execute(
            update(Conversation)
            .where(Conversation.chapter_id.in_(old_chapter_ids))
            .values(chapter_id=None)
        )
        await db.execute(delete(Exercise).where(Exercise.chapter_id.in_(old_chapter_ids)))
        await db.execute(delete(Chapter).where(Chapter.id.in_(old_chapter_ids)))

    path.outline = outline
    for ch in outline.get("chapters", []):
        db.add(
            Chapter(
                path_id=path.id,
                sort_order=ch["order"],
                title=ch["title"],
                summary=ch.get("summary", ""),
                status="unlocked" if ch["order"] == 1 else "locked",
            )
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
    if path.user_id != user.id and getattr(user, "role", None) != "admin":
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
async def get_path(path_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """获取学习路线详情（Redis 缓存）"""
    # 1. 先查缓存
    try:
        cached = await cache_get("path", str(path_id))
        if cached:
            return cached
    except Exception as e:
        logger.warning(f"Redis cache_get failed for path {path_id}: {e}")

    # 2. 缓存未命中 → 查库
    result = await db.execute(select(LearningPath).where(LearningPath.id == path_id))
    path = result.scalar_one_or_none()
    if not path:
        raise HTTPException(status_code=404, detail="学习路线不存在")

    # 3. 写入缓存（10 分钟）
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
async def get_chapters(path_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """获取路线下的所有章节（Redis 缓存）"""
    # 1. 先查缓存
    try:
        cached = await cache_get("chapters", str(path_id))
        if cached:
            return cached
    except Exception as e:
        logger.warning(f"Redis cache_get failed for chapters of path {path_id}: {e}")

    # 2. 缓存未命中 → 查库
    result = await db.execute(
        select(Chapter).where(Chapter.path_id == path_id).order_by(Chapter.sort_order)
    )
    chapters = result.scalars().all()

    # 3. 写入缓存（5 分钟，章节状态变化时会失效）
    try:
        chapter_list = [
            {
                "id": str(ch.id),
                "path_id": str(ch.path_id),
                "sort_order": ch.sort_order,
                "title": ch.title,
                "summary": ch.summary,
                "status": ch.status,
                "completed_at": ch.completed_at.isoformat() if ch.completed_at else None,
                "created_at": ch.created_at.isoformat() if ch.created_at else None,
            }
            for ch in chapters
        ]
        await cache_set("chapters", str(path_id), value=chapter_list, ttl=300)
    except Exception as e:
        logger.warning(f"Redis cache_set failed for chapters of path {path_id}: {e}")

    return chapters
