"""知识库 REST API — 仅管理员可访问"""

import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import require_admin
from app.db.database import get_db
from app.models.models import KnowledgeBase, KnowledgeDocument, User
from app.schemas.schemas import (
    BackgroundJobResponse,
    KnowledgeBaseCreate,
    KnowledgeBaseDetailResponse,
    KnowledgeBaseResponse,
    KnowledgeBaseUpdate,
    KnowledgeDocumentResponse,
)
from app.services.background_jobs import cancel_document_jobs, create_and_enqueue_job
from app.services.kb_ingest import create_uploaded_document, delete_document_files_and_chunks

router = APIRouter()


async def _get_kb(db: AsyncSession, kb_id: uuid.UUID) -> KnowledgeBase:
    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    return kb


def _kb_response(kb: KnowledgeBase, document_count: int = 0) -> KnowledgeBaseResponse:
    return KnowledgeBaseResponse(
        id=kb.id,
        name=kb.name,
        description=kb.description,
        status=kb.status,
        created_at=kb.created_at,
        updated_at=kb.updated_at,
        document_count=document_count,
    )


@router.post("/", response_model=KnowledgeBaseResponse, status_code=201)
async def create_knowledge_base(
    body: KnowledgeBaseCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    kb = KnowledgeBase(
        user_id=user.id,
        name=body.name.strip(),
        description=(body.description or "").strip() or None,
        status="active",
    )
    db.add(kb)
    await db.commit()
    await db.refresh(kb)
    return _kb_response(kb, 0)


@router.get("/", response_model=list[KnowledgeBaseResponse])
async def list_knowledge_bases(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """平台全部知识库（任意管理员可查看）。"""
    count_sq = (
        select(KnowledgeDocument.kb_id, func.count(KnowledgeDocument.id).label("cnt"))
        .group_by(KnowledgeDocument.kb_id)
        .subquery()
    )
    result = await db.execute(
        select(KnowledgeBase, func.coalesce(count_sq.c.cnt, 0))
        .outerjoin(count_sq, count_sq.c.kb_id == KnowledgeBase.id)
        .order_by(KnowledgeBase.updated_at.desc())
    )
    rows = result.all()
    return [_kb_response(kb, int(cnt)) for kb, cnt in rows]


@router.get("/{kb_id}", response_model=KnowledgeBaseDetailResponse)
async def get_knowledge_base(
    kb_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    result = await db.execute(
        select(KnowledgeBase)
        .options(selectinload(KnowledgeBase.documents))
        .where(KnowledgeBase.id == kb_id)
    )
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    docs = sorted(kb.documents, key=lambda d: d.created_at, reverse=True)
    return KnowledgeBaseDetailResponse(
        id=kb.id,
        name=kb.name,
        description=kb.description,
        status=kb.status,
        created_at=kb.created_at,
        updated_at=kb.updated_at,
        document_count=len(docs),
        documents=[KnowledgeDocumentResponse.model_validate(d) for d in docs],
    )


@router.patch("/{kb_id}", response_model=KnowledgeBaseResponse)
async def update_knowledge_base(
    kb_id: uuid.UUID,
    body: KnowledgeBaseUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    kb = await _get_kb(db, kb_id)
    if body.name is not None:
        kb.name = body.name.strip()
    if body.description is not None:
        kb.description = body.description.strip() or None
    await db.commit()
    await db.refresh(kb)
    count = await db.scalar(
        select(func.count()).select_from(KnowledgeDocument).where(KnowledgeDocument.kb_id == kb.id)
    )
    return _kb_response(kb, int(count or 0))


@router.delete("/{kb_id}", status_code=204)
async def delete_knowledge_base(
    kb_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    result = await db.execute(
        select(KnowledgeBase)
        .options(selectinload(KnowledgeBase.documents))
        .where(KnowledgeBase.id == kb_id)
    )
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    await cancel_document_jobs(db, [str(doc.id) for doc in kb.documents])
    for doc in list(kb.documents):
        await delete_document_files_and_chunks(db, doc)
    await db.delete(kb)
    await db.commit()
    return None


@router.post("/{kb_id}/documents", response_model=BackgroundJobResponse, status_code=202)
async def upload_document(
    kb_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    await _get_kb(db, kb_id)
    doc: KnowledgeDocument | None = None
    try:
        doc = await create_uploaded_document(db, kb_id=kb_id, user_id=user.id, upload=file)
        await db.commit()
    except Exception:
        if doc and doc.storage_path:
            Path(doc.storage_path).unlink(missing_ok=True)
        raise
    assert doc is not None
    await db.refresh(doc)
    try:
        return await create_and_enqueue_job(
            db,
            user=user,
            job_type="document_ingest",
            payload={"document_id": str(doc.id), "kb_id": str(kb_id)},
        )
    except Exception as exc:
        doc.status = "failed"
        doc.error_message = f"后台任务入队失败: {exc}"[:500]
        await db.commit()
        raise HTTPException(status_code=503, detail=doc.error_message) from exc


@router.delete("/{kb_id}/documents/{doc_id}", status_code=204)
async def delete_document(
    kb_id: uuid.UUID,
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    await _get_kb(db, kb_id)
    result = await db.execute(
        select(KnowledgeDocument).where(
            KnowledgeDocument.id == doc_id,
            KnowledgeDocument.kb_id == kb_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    await cancel_document_jobs(db, [str(doc_id)])
    await delete_document_files_and_chunks(db, doc)
    await db.commit()
    return None
