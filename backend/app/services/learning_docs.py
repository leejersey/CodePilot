"""章节「文档学习」模式 — 完整讲义分阶段阅读"""

from __future__ import annotations

import re
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import Chapter, KnowledgeChunk, KnowledgeDocument, LearningPath


def _clean_stage_title(title: str, fallback: str = "未命名") -> str:
    t = (title or "").strip()
    t = t.replace("**", "").replace("__", "")
    t = re.sub(r"^#+\s*", "", t)
    # 去掉标题自带序号，避免 UI 再加「1. 1.」
    t = re.sub(r"^[\d]+[\.．、\)]\s*", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    return (t[:48] or fallback)


def _merge_short_stages(stages: list[dict], min_chars: int = 180) -> list[dict]:
    """仅把「过短」的阶段并入上一段，避免一行代码单独成 Tab。"""
    if not stages:
        return stages
    merged: list[dict] = [dict(stages[0])]
    for st in stages[1:]:
        if len(st["content"].strip()) < min_chars:
            merged[-1]["content"] = (
                merged[-1]["content"].rstrip() + "\n\n" + st["content"].lstrip()
            )
        else:
            merged.append(dict(st))
    if len(merged) >= 2 and len(merged[-1]["content"].strip()) < min_chars:
        last = merged.pop()
        merged[-1]["content"] = (
            merged[-1]["content"].rstrip() + "\n\n" + last["content"].lstrip()
        )
    return merged


def _cap_stages(stages: list[dict], max_stages: int = 8) -> list[dict]:
    """阶段过多时两两合并，保证导航可点可选。"""
    if len(stages) <= max_stages:
        return stages
    while len(stages) > max_stages:
        next_round: list[dict] = []
        i = 0
        # 每一轮尽量合并到不超过 max_stages
        need_merge = len(stages) - max_stages
        merged_count = 0
        while i < len(stages):
            if merged_count < need_merge and i + 1 < len(stages):
                a, b = stages[i], stages[i + 1]
                next_round.append(
                    {
                        "id": a["id"],
                        "title": a["title"],
                        "content": a["content"].rstrip() + "\n\n" + b["content"].lstrip(),
                    }
                )
                i += 2
                merged_count += 1
            else:
                next_round.append(stages[i])
                i += 1
        stages = next_round
    return stages


def _split_by_size(text: str, fallback_title: str, max_stages: int = 6) -> list[dict]:
    """无可用标题时按篇幅粗切；不在代码围栏中间切断。"""
    text = text.strip()
    if len(text) < 1200:
        return [{"id": "s1", "title": fallback_title, "content": text}]

    lines = text.split("\n")
    fence_re = re.compile(r"^(`{3,}|~{3,})")
    blocks: list[str] = []
    buf: list[str] = []
    in_fence = False
    fence_tick = ""

    def flush() -> None:
        nonlocal buf
        block = "\n".join(buf).strip()
        if block:
            blocks.append(block)
        buf = []

    for line in lines:
        stripped = line.strip()
        fm = fence_re.match(stripped)
        if fm:
            tick = fm.group(1)[0]
            if not in_fence:
                in_fence = True
                fence_tick = tick
            elif tick == fence_tick:
                in_fence = False
                fence_tick = ""
            buf.append(line)
            continue
        if not in_fence and stripped == "" and buf:
            flush()
            continue
        buf.append(line)
    flush()

    if not blocks:
        return [{"id": "s1", "title": fallback_title, "content": text}]

    target = max(800, len(text) // max_stages)
    stages: list[dict] = []
    acc: list[str] = []
    acc_len = 0
    for block in blocks:
        acc.append(block)
        acc_len += len(block)
        if acc_len >= target and len(stages) < max_stages - 1:
            stages.append(
                {
                    "id": f"s{len(stages) + 1}",
                    "title": f"第 {len(stages) + 1} 部分",
                    "content": "\n\n".join(acc).strip(),
                }
            )
            acc, acc_len = [], 0
    if acc:
        content = "\n\n".join(acc).strip()
        if stages and len(content) < 300:
            stages[-1]["content"] += "\n\n" + content
        else:
            stages.append(
                {
                    "id": f"s{len(stages) + 1}",
                    "title": f"第 {len(stages) + 1} 部分" if stages else fallback_title,
                    "content": content,
                }
            )
    return stages or [{"id": "s1", "title": fallback_title, "content": text}]


def build_handout_stages(
    *,
    chapter_title: str,
    chapter_summary: str | None,
    documents: list[tuple[str, str]],
) -> list[dict]:
    """文档学习只展示一份完整讲义：导读 + 封面文档全文（按标题分阶段）。"""
    stages: list[dict] = []
    title = (chapter_title or "本章导读").strip() or "本章导读"
    summary = (chapter_summary or "").strip()
    if summary:
        stages.append(
            {
                "id": "intro",
                "title": "本章导读",
                "content": f"# {title}\n\n{summary}",
            }
        )

    for doc_index, (filename, text) in enumerate(documents):
        body = (text or "").strip()
        if not body:
            continue
        fallback = (filename or "正文").strip() or "正文"
        for piece in split_markdown_stages(body, fallback_title=fallback):
            stages.append(
                {
                    "id": f"d{doc_index}-{piece['id']}",
                    "title": piece["title"],
                    "content": piece["content"],
                    "from_doc": filename,
                }
            )

    if not stages:
        stages.append(
            {
                "id": "intro",
                "title": "本章导读",
                "content": f"# {title}\n\n（暂无文档内容）",
            }
        )
    return stages


def split_markdown_stages(markdown: str, fallback_title: str = "正文") -> list[dict]:
    """
    按大标题粗分阶段（优先 # / ##），合并过短块，最多约 8 段。
    不再默认按 ### 细切，避免导航碎成「一行代码一阶段」。
    """
    text = (markdown or "").replace("\r\n", "\n").strip()
    if not text:
        return [
            {
                "id": "s1",
                "title": fallback_title,
                "content": f"# {fallback_title}\n\n（暂无内容）",
            }
        ]

    lines = text.split("\n")
    heading_re = re.compile(r"^(#{1,3})\s+(.+?)\s*$")
    fence_re = re.compile(r"^(`{3,}|~{3,})")
    headings: list[tuple[int, int, str]] = []  # (line_idx, level, title)
    in_fence = False
    fence_tick = ""
    for i, line in enumerate(lines):
        stripped = line.strip()
        fm = fence_re.match(stripped)
        if fm:
            tick = fm.group(1)[0]
            if not in_fence:
                in_fence = True
                fence_tick = tick
            elif tick == fence_tick:
                in_fence = False
                fence_tick = ""
            continue
        if in_fence:
            # 代码块内的「# 注释」绝不能当 Markdown 标题，否则会把围栏拆碎
            continue

        m = heading_re.match(line)
        if not m:
            continue
        level = len(m.group(1))
        title = _clean_stage_title(m.group(2), fallback_title)
        if len(title) > 56:
            continue
        if re.match(
            r"^(import |from |print\(|def |class |const |let |var |```)",
            title,
            re.I,
        ):
            continue
        # 误把语言标签当标题（残破围栏常见）
        if title.lower() in {
            "python",
            "javascript",
            "typescript",
            "java",
            "go",
            "rust",
            "bash",
            "shell",
            "sql",
            "c++",
            "cpp",
            "json",
            "html",
            "css",
            "text",
            "plaintext",
        }:
            continue
        headings.append((i, level, title))

    if not headings:
        return _split_by_size(text, fallback_title)

    h1 = [h for h in headings if h[1] == 1]
    h2 = [h for h in headings if h[1] == 2]
    h3 = [h for h in headings if h[1] == 3]

    major_split = False  # True = 按 #/## 切，保留结构不再狠合并

    # 选切分层级：优先大标题，目标大约 3~8 段
    if len(h1) >= 2:
        chosen = h1
        major_split = True
    elif len(h2) >= 2:
        chosen = h2
        major_split = True
    elif len(h1) == 1 and len(h2) >= 1:
        chosen = [h for h in headings if h[1] <= 2]
        major_split = True
    elif len(h2) == 1 and len(h3) >= 2 and len(text) > 2500:
        # 单 ## 下挂很多 ###：按篇幅打包 ###
        chosen = _pack_heading_cuts(h3, lines, budget=900)
        if chosen and chosen[0][0] > h2[0][0]:
            chosen = [h2[0], *chosen]
        major_split = False
    elif len(h3) >= 2:
        chosen = _pack_heading_cuts(h3, lines, budget=900)
        major_split = False
    else:
        chosen = headings
        major_split = any(h[1] <= 2 for h in chosen)

    # 去重并排序
    seen = set()
    ordered: list[tuple[int, str]] = []
    for line_idx, _level, title in sorted(chosen, key=lambda x: x[0]):
        if line_idx in seen:
            continue
        seen.add(line_idx)
        ordered.append((line_idx, title))

    if not ordered:
        return _split_by_size(text, fallback_title)

    stages: list[dict] = []
    for n, (start, title) in enumerate(ordered):
        end = ordered[n + 1][0] if n + 1 < len(ordered) else len(lines)
        block = "\n".join(lines[start:end]).strip()
        if not block:
            continue
        stages.append(
            {
                "id": f"s{n + 1}",
                "title": title or f"阶段 {n + 1}",
                "content": block,
            }
        )

    preface = "\n".join(lines[: ordered[0][0]]).strip()
    if preface and stages:
        stages[0]["content"] = preface + "\n\n" + stages[0]["content"]

    if not stages:
        return _split_by_size(text, fallback_title)

    if major_split and len(stages) <= 8:
        # 保留 ## 章节；只去掉几乎为空的壳
        stages = _merge_short_stages(stages, min_chars=40)
    else:
        stages = _merge_short_stages(stages, min_chars=120)
        stages = _cap_stages(stages, max_stages=8)
        # 仍只有 1 段但很长：再按篇幅切开
        if len(stages) == 1 and len(stages[0]["content"]) > 2200:
            stages = _split_by_size(
                stages[0]["content"], stages[0]["title"] or fallback_title
            )

    for i, st in enumerate(stages):
        st["id"] = f"s{i + 1}"
        st["title"] = _clean_stage_title(st["title"], f"第 {i + 1} 部分")

    return stages


def _pack_heading_cuts(
    heads: list[tuple[int, int, str]],
    lines: list[str],
    budget: int = 900,
) -> list[tuple[int, int, str]]:
    """把密集小标题按字数打包成少量切点。"""
    if not heads:
        return []
    packed: list[tuple[int, int, str]] = []
    buf_start, buf_level, buf_title = heads[0]
    buf_len = 0
    for n, (line_idx, level, title) in enumerate(heads):
        end = heads[n + 1][0] if n + 1 < len(heads) else len(lines)
        piece_len = sum(len(lines[j]) + 1 for j in range(line_idx, end))
        if buf_len >= budget and n > 0:
            packed.append((buf_start, buf_level, buf_title))
            buf_start, buf_level, buf_title = line_idx, level, title
            buf_len = 0
        buf_len += piece_len
    packed.append((buf_start, buf_level, buf_title))
    return packed


async def load_document_text(db: AsyncSession, doc: KnowledgeDocument) -> str:
    """优先读磁盘原文；失败则拼接 chunks。"""
    if doc.storage_path:
        path = Path(doc.storage_path)
        if path.is_file():
            try:
                data = path.read_bytes()
                if path.suffix.lower() in {".md", ".markdown", ".txt", ""}:
                    return data.decode("utf-8", errors="replace").strip()
                # PDF 等：走 chunk 拼接
            except OSError:
                pass

    result = await db.execute(
        select(KnowledgeChunk)
        .where(KnowledgeChunk.document_id == doc.id)
        .order_by(KnowledgeChunk.chunk_index)
    )
    chunks = list(result.scalars().all())
    if not chunks:
        return ""
    # 简单拼接（有 overlap，略有重复可接受）
    return "\n\n".join(c.content for c in chunks if c.content).strip()


async def get_path_ready_docs(
    db: AsyncSession, path: LearningPath
) -> list[KnowledgeDocument]:
    kb_ids = [kb.id for kb in (path.knowledge_bases or [])]
    if not kb_ids:
        return []
    result = await db.execute(
        select(KnowledgeDocument)
        .where(
            KnowledgeDocument.kb_id.in_(kb_ids),
            KnowledgeDocument.status == "ready",
        )
        .order_by(KnowledgeDocument.filename)
    )
    return list(result.scalars().all())


def _outline_chapter(path: LearningPath, chapter: Chapter) -> dict | None:
    outline = path.outline if isinstance(path.outline, dict) else {}
    chapters = outline.get("chapters") or []
    for ch in chapters:
        if not isinstance(ch, dict):
            continue
        if ch.get("order") == chapter.sort_order:
            return ch
        if (ch.get("title") or "").strip() == (chapter.title or "").strip():
            return ch
    return None


async def build_learning_docs_payload(
    db: AsyncSession, chapter_id: uuid.UUID
) -> dict:
    result = await db.execute(
        select(Chapter)
        .options(
            selectinload(Chapter.path).selectinload(LearningPath.knowledge_bases)
        )
        .where(Chapter.id == chapter_id)
    )
    chapter = result.scalar_one_or_none()
    if not chapter or not chapter.path:
        return {}

    path = chapter.path
    docs = await get_path_ready_docs(db, path)
    outline_ch = _outline_chapter(path, chapter)
    covers = []
    if outline_ch:
        covers = [
            c for c in (outline_ch.get("covers") or []) if isinstance(c, str) and c.strip()
        ]

    cover_docs: list[KnowledgeDocument] = []
    if covers:
        by_name = {d.filename: d for d in docs}
        for name in covers:
            if name in by_name:
                cover_docs.append(by_name[name])
            else:
                for d in docs:
                    if name in d.filename or d.filename in name:
                        cover_docs.append(d)
                        break

    if not cover_docs and docs:
        title = (chapter.title or "").lower()
        related = [
            d
            for d in docs
            if any(t in d.filename.lower() for t in title.split() if len(t) >= 2)
        ]
        cover_docs = related[:2] if related else docs[:1]

    document_texts: list[tuple[str, str]] = []
    for doc in cover_docs:
        text = await load_document_text(db, doc)
        if text:
            document_texts.append((doc.filename, text))

    handout_stages = build_handout_stages(
        chapter_title=chapter.title or "",
        chapter_summary=chapter.summary,
        documents=document_texts,
    )

    return {
        "chapter_id": str(chapter.id),
        "chapter_title": chapter.title,
        "sources": {
            "handout": {
                "available": True,
                "label": "课程讲义",
                "stages": handout_stages,
            },
            "knowledge_base": {
                "available": False,
                "label": "知识库原文",
                "documents": [],
            },
        },
    }


async def build_kb_doc_stages(
    db: AsyncSession, chapter_id: uuid.UUID, doc_id: uuid.UUID
) -> dict:
    result = await db.execute(
        select(Chapter)
        .options(
            selectinload(Chapter.path).selectinload(LearningPath.knowledge_bases)
        )
        .where(Chapter.id == chapter_id)
    )
    chapter = result.scalar_one_or_none()
    if not chapter or not chapter.path:
        return {"stages": []}

    docs = await get_path_ready_docs(db, chapter.path)
    doc = next((d for d in docs if d.id == doc_id), None)
    if not doc:
        # 也允许同路径库下的文档 id 直接查
        r2 = await db.execute(
            select(KnowledgeDocument).where(KnowledgeDocument.id == doc_id)
        )
        doc = r2.scalar_one_or_none()
        if not doc or doc.status != "ready":
            return {"stages": [], "error": "文档不存在或未就绪"}
        allowed_kb = {kb.id for kb in (chapter.path.knowledge_bases or [])}
        if doc.kb_id not in allowed_kb:
            return {"stages": [], "error": "文档不属于本课程知识库"}

    text = await load_document_text(db, doc)
    stages = split_markdown_stages(text, fallback_title=doc.filename)
    return {
        "doc_id": str(doc.id),
        "filename": doc.filename,
        "stages": stages,
    }
