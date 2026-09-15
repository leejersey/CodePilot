"""知识库文档解析、切块与入库"""

from __future__ import annotations

import re
import uuid
from io import BytesIO
from pathlib import Path

from fastapi import HTTPException, UploadFile
from pypdf import PdfReader
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.models import KnowledgeChunk, KnowledgeDocument
from app.services.embeddings import embed_texts

settings = get_settings()

ALLOWED_EXTENSIONS = {".pdf", ".md", ".markdown", ".txt"}
ALLOWED_MIME = {
    "application/pdf",
    "text/plain",
    "text/markdown",
    "application/octet-stream",
}

CHUNK_SIZE = 700
CHUNK_OVERLAP = 100


def _ext(filename: str) -> str:
    return Path(filename).suffix.lower()


def parse_document_bytes(filename: str, data: bytes) -> str:
    """从 PDF / Markdown / TXT 提取纯文本。"""
    ext = _ext(filename)
    if ext == ".pdf":
        reader = PdfReader(BytesIO(data))
        pages = []
        for page in reader.pages:
            text = page.extract_text() or ""
            pages.append(text)
        return "\n".join(pages).strip()
    if ext in {".md", ".markdown", ".txt"}:
        return data.decode("utf-8", errors="replace").strip()
    raise HTTPException(status_code=400, detail=f"不支持的文件类型: {ext}")


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """按字符切块，带重叠。优先在段落边界断开。"""
    text = re.sub(r"\r\n?", "\n", text).strip()
    if not text:
        return []

    # 先按空行拆段，再拼成接近 chunk_size 的块
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    chunks: list[str] = []
    current = ""

    def flush():
        nonlocal current
        if current.strip():
            chunks.append(current.strip())
        current = ""

    for para in paragraphs:
        if len(para) > chunk_size:
            if current:
                flush()
            # 超长段落按窗口切
            start = 0
            while start < len(para):
                end = min(start + chunk_size, len(para))
                chunks.append(para[start:end].strip())
                if end >= len(para):
                    break
                start = max(end - overlap, start + 1)
            continue

        candidate = f"{current}\n\n{para}".strip() if current else para
        if len(candidate) <= chunk_size:
            current = candidate
        else:
            flush()
            current = para

    flush()

    # 若只有一块且仍然过长，兜底滑动窗口
    if len(chunks) == 1 and len(chunks[0]) > chunk_size * 2:
        long = chunks[0]
        chunks = []
        start = 0
        while start < len(long):
            end = min(start + chunk_size, len(long))
            chunks.append(long[start:end])
            if end >= len(long):
                break
            start = max(end - overlap, start + 1)

    return [c for c in chunks if c]


async def ingest_uploaded_file(
    db: AsyncSession,
    *,
    kb_id: uuid.UUID,
    user_id: uuid.UUID,
    upload: UploadFile,
) -> KnowledgeDocument:
    """保存上传文件、解析切块、嵌入并写入 knowledge_chunks。"""
    filename = upload.filename or "untitled.txt"
    ext = _ext(filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="仅支持 PDF / Markdown / TXT")

    data = await upload.read()
    if not data:
        raise HTTPException(status_code=400, detail="文件为空")
    if len(data) > settings.MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail=f"文件超过 {settings.MAX_UPLOAD_BYTES // (1024 * 1024)}MB 限制")

    doc_id = uuid.uuid4()
    upload_root = Path(settings.UPLOAD_DIR) / "kb" / str(user_id) / str(doc_id)
    upload_root.mkdir(parents=True, exist_ok=True)
    storage_path = upload_root / filename
    storage_path.write_bytes(data)

    doc = KnowledgeDocument(
        id=doc_id,
        kb_id=kb_id,
        filename=filename,
        mime_type=upload.content_type,
        byte_size=len(data),
        storage_path=str(storage_path),
        status="processing",
        chunk_count=0,
    )
    db.add(doc)
    await db.flush()

    try:
        text = parse_document_bytes(filename, data)
        if not text:
            raise ValueError("未能从文件中提取到文本内容")

        pieces = chunk_text(text)
        if not pieces:
            raise ValueError("切块结果为空")

        vectors = await embed_texts(pieces)
        for idx, (content, vector) in enumerate(zip(pieces, vectors)):
            db.add(
                KnowledgeChunk(
                    document_id=doc.id,
                    kb_id=kb_id,
                    chunk_index=idx,
                    content=content,
                    embedding=[float(x) for x in vector],
                    token_count=len(content) // 4,
                )
            )

        doc.status = "ready"
        doc.chunk_count = len(pieces)
        doc.error_message = None
    except HTTPException:
        doc.status = "failed"
        doc.error_message = "embedding 未配置或调用失败"
        await db.flush()
        raise
    except Exception as e:
        doc.status = "failed"
        doc.error_message = str(e)[:500]
        await db.flush()
        raise HTTPException(status_code=400, detail=f"文档处理失败: {doc.error_message}")

    await db.flush()
    return doc


async def delete_document_files_and_chunks(db: AsyncSession, doc: KnowledgeDocument) -> None:
    """删除文档记录、chunks 与本地文件。"""
    await db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id == doc.id))
    path = Path(doc.storage_path)
    try:
        if path.is_file():
            path.unlink()
        parent = path.parent
        if parent.exists() and parent.is_dir() and not any(parent.iterdir()):
            parent.rmdir()
    except OSError:
        pass
    await db.delete(doc)
