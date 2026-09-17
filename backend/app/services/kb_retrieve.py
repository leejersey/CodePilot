"""知识库向量检索"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import KnowledgeBase, KnowledgeChunk, KnowledgeDocument
from app.services.embeddings import embed_query

logger = logging.getLogger(__name__)


async def retrieve_chunks(
    db: AsyncSession,
    *,
    kb_ids: list[uuid.UUID],
    query: str,
    top_k: int = 5,
) -> list[dict]:
    """在指定知识库中按余弦相似度检索 top-k chunks。"""
    if not kb_ids or not query.strip():
        return []

    try:
        query_vec = await embed_query(query.strip())
    except Exception as e:
        logger.warning("embed_query failed: %s", e)
        return []

    distance = KnowledgeChunk.embedding.cosine_distance(query_vec)
    stmt = (
        select(
            KnowledgeChunk.id,
            KnowledgeChunk.content,
            KnowledgeChunk.chunk_index,
            KnowledgeChunk.kb_id,
            KnowledgeChunk.document_id,
            KnowledgeDocument.filename,
            distance.label("distance"),
        )
        .join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
        .where(KnowledgeChunk.kb_id.in_(kb_ids))
        .where(KnowledgeChunk.embedding.is_not(None))
        .where(KnowledgeDocument.status == "ready")
        .order_by(distance)
        .limit(top_k)
    )
    result = await db.execute(stmt)
    rows = result.all()

    items = []
    for row in rows:
        dist = float(row.distance) if row.distance is not None else 1.0
        items.append(
            {
                "chunk_id": str(row.id),
                "kb_id": str(row.kb_id),
                "document_id": str(row.document_id),
                "filename": row.filename,
                "chunk_index": row.chunk_index,
                "content": row.content,
                "score": round(1.0 - dist, 4),
            }
        )
    return items


def format_retrieval_context(chunks: list[dict]) -> str:
    """格式化为注入 system prompt 的引用文本。"""
    if not chunks:
        return ""
    lines = ["知识库检索结果（请优先依据以下片段作答，并在合适处标注来源文件名）："]
    for i, c in enumerate(chunks, 1):
        lines.append(
            f"[{i}] 来源：{c['filename']} #chunk-{c['chunk_index']}（相关度 {c['score']}）\n{c['content']}"
        )
    return "\n\n".join(lines)


async def get_kb_catalog_and_snippets(
    db: AsyncSession,
    *,
    kb_ids: list[uuid.UUID],
    topic: str,
    top_k: int = 10,
) -> str:
    """为路径大纲生成准备：文档目录 + 检索片段，便于大纲跟随知识库结构。"""
    if not kb_ids:
        return ""

    result = await db.execute(
        select(KnowledgeBase)
        .options(selectinload(KnowledgeBase.documents))
        .where(KnowledgeBase.id.in_(kb_ids))
    )
    kbs = list(result.scalars().all())

    ready_filenames: list[str] = []
    catalog_lines = ["知识库文档目录（大纲必须覆盖这些资料中的主要阶段与专题）："]
    for kb in kbs:
        catalog_lines.append(f"- 知识库「{kb.name}」")
        docs = sorted(kb.documents, key=lambda d: d.filename)
        for d in docs:
            if d.status != "ready":
                continue
            ready_filenames.append(d.filename)
            catalog_lines.append(f"  · {d.filename}（{d.chunk_count} chunks）")

    checklist_lines = [
        "【必须覆盖清单】下面每个文档至少要在某一章的 title 或 summary 中被体现"
        "（可合并相近文档为一章，但不得整份遗漏，尤其是「专题」类文档）："
    ]
    for i, name in enumerate(ready_filenames, 1):
        checklist_lines.append(f"  {i}. {name}")

    # 每个 ready 文档取前 2 个 chunk 作为结构预览
    preview_lines = ["文档开篇预览："]
    for kb in kbs:
        for d in sorted(kb.documents, key=lambda x: x.filename):
            if d.status != "ready":
                continue
            chunk_rows = await db.execute(
                select(KnowledgeChunk)
                .where(KnowledgeChunk.document_id == d.id)
                .order_by(KnowledgeChunk.chunk_index)
                .limit(2)
            )
            for ch in chunk_rows.scalars().all():
                snippet = ch.content[:500].replace("\n", " ")
                preview_lines.append(f"- {d.filename}#{ch.chunk_index}: {snippet}")

    # 多路检索：主题 + 阶段/专题关键词，提升覆盖面
    query_variants = [
        topic,
        f"{topic} 阶段 大纲 专题",
        "第一阶段 第二阶段 第三阶段 实战",
        "专题 Playwright 自动化 LLM 工程化",
    ]
    seen_chunk_ids: set[str] = set()
    retrieved: list[dict] = []
    per_query = max(4, top_k // 2)
    for q in query_variants:
        for item in await retrieve_chunks(db, kb_ids=kb_ids, query=q, top_k=per_query):
            cid = item["chunk_id"]
            if cid in seen_chunk_ids:
                continue
            seen_chunk_ids.add(cid)
            retrieved.append(item)
            if len(retrieved) >= top_k * 2:
                break
        if len(retrieved) >= top_k * 2:
            break

    parts = [
        "\n".join(catalog_lines),
        "\n".join(checklist_lines),
        "\n".join(preview_lines),
    ]
    if retrieved:
        parts.append(format_retrieval_context(retrieved))
    return "\n\n".join(parts)


async def list_ready_document_filenames(
    db: AsyncSession, kb_ids: list[uuid.UUID]
) -> list[str]:
    """平台 ready 文档文件名（按文件名排序）。"""
    if not kb_ids:
        return []
    result = await db.execute(
        select(KnowledgeDocument.filename)
        .where(KnowledgeDocument.kb_id.in_(kb_ids))
        .where(KnowledgeDocument.status == "ready")
        .order_by(KnowledgeDocument.filename)
    )
    return list(result.scalars().all())


async def count_ready_documents(db: AsyncSession, kb_ids: list[uuid.UUID]) -> int:
    if not kb_ids:
        return 0
    result = await db.execute(
        select(KnowledgeDocument.id)
        .where(KnowledgeDocument.kb_id.in_(kb_ids))
        .where(KnowledgeDocument.status == "ready")
    )
    return len(list(result.scalars().all()))


async def get_kb_snippets_for_outline(
    db: AsyncSession,
    *,
    kb_ids: list[uuid.UUID],
    topic: str,
    top_k: int = 8,
) -> str:
    """为路径大纲生成准备知识库片段。"""
    return await get_kb_catalog_and_snippets(db, kb_ids=kb_ids, topic=topic, top_k=top_k)


async def list_ready_kb_ids_for_user(db: AsyncSession, user_id: uuid.UUID) -> list[uuid.UUID]:
    """用户名下至少有一份 ready 文档的知识库 ID。（旧接口，消费侧请用平台库）"""
    result = await db.execute(
        select(KnowledgeBase.id)
        .join(KnowledgeDocument, KnowledgeDocument.kb_id == KnowledgeBase.id)
        .where(KnowledgeBase.user_id == user_id)
        .where(KnowledgeDocument.status == "ready")
        .distinct()
    )
    return list(result.scalars().all())


async def list_platform_ready_kb_ids(db: AsyncSession) -> list[uuid.UUID]:
    """Approved public active KBs with at least one ready document."""
    result = await db.execute(
        select(KnowledgeBase.id)
        .join(KnowledgeDocument, KnowledgeDocument.kb_id == KnowledgeBase.id)
        .where(KnowledgeBase.status == "active")
        .where(KnowledgeBase.visibility == "platform_public")
        .where(KnowledgeBase.approval_status == "approved")
        .where(KnowledgeDocument.status == "ready")
        .distinct()
    )
    return list(result.scalars().all())


async def load_kbs_by_ids(
    db: AsyncSession, kb_ids: list[uuid.UUID]
) -> list[KnowledgeBase]:
    if not kb_ids:
        return []
    unique_ids = list(dict.fromkeys(kb_ids))
    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id.in_(unique_ids)))
    return list(result.scalars().all())


def is_kb_relevant_to_topic(
    topic: str, *, kb_name: str, filenames: list[str]
) -> bool:
    """主题语言与知识库明显不一致时判定为不相关（避免 Node 课吃到 Python 库）。"""
    from app.services.chat import detect_language_hint

    topic_hint = detect_language_hint(topic)
    if not topic_hint:
        return True
    # 分别识别库名和文件名。混合技术栈资料可能同时包含 HTML/CSS/JS，
    # 拼成一个字符串只会命中首个语言，错误排除整个前端知识库。
    catalog_hints = {
        hint
        for part in (kb_name, *filenames)
        if (hint := detect_language_hint(part)) is not None
    }
    if not catalog_hints:
        return False
    return topic_hint in catalog_hints


async def filter_kbs_relevant_to_topic(
    db: AsyncSession,
    *,
    topic: str,
    kbs: list[KnowledgeBase],
) -> tuple[list[KnowledgeBase], list[str]]:
    """筛出与主题相关的知识库，并返回对应 ready 文档文件名。"""
    if not kbs:
        return [], []
    relevant: list[KnowledgeBase] = []
    all_filenames: list[str] = []
    for kb in kbs:
        filenames = await list_ready_document_filenames(db, [kb.id])
        if is_kb_relevant_to_topic(topic, kb_name=kb.name, filenames=filenames):
            relevant.append(kb)
            all_filenames.extend(filenames)
    return relevant, all_filenames
