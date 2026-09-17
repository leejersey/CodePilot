"""Knowledge-base APIs with creator ownership and admin review."""

import uuid
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, is_admin_role, require_admin, require_creator
from app.db.database import get_db
from app.models.models import (
    KnowledgeBase,
    KnowledgeDocument,
    User,
    course_version_knowledge_bases,
)
from app.schemas.schemas import (
    BackgroundJobResponse,
    KnowledgeBaseCreate,
    KnowledgeBaseDetailResponse,
    KnowledgeBaseResponse,
    KnowledgeBaseReviewUpdate,
    KnowledgeBaseUpdate,
    KnowledgeDocumentResponse,
)
from app.services.background_jobs import (
    abort_queued_jobs,
    cancel_document_jobs,
    create_and_enqueue_job,
)
from app.services.course_generation import (
    can_delete_knowledge_base,
    can_manage_knowledge_base,
    is_selectable_knowledge_base,
)
from app.services.kb_ingest import (
    cleanup_document_file,
    create_uploaded_document,
    delete_document_files_and_chunks,
)

router = APIRouter()


def _mark_creator_change_pending(kb: KnowledgeBase, user: User) -> None:
    if not is_admin_role(user.role):
        kb.visibility = "private"
        kb.approval_status = "pending"
        kb.review_note = None
        kb.reviewed_by = None
        kb.reviewed_at = None


async def _get_kb(
    db: AsyncSession,
    kb_id: uuid.UUID,
    user: User | None = None,
) -> KnowledgeBase:
    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if user is not None and not can_manage_knowledge_base(kb, user):
        raise HTTPException(status_code=404, detail="知识库不存在")
    return kb


def _kb_response(
    kb: KnowledgeBase,
    document_count: int = 0,
    ready_document_count: int = 0,
) -> KnowledgeBaseResponse:
    return KnowledgeBaseResponse(
        id=kb.id,
        name=kb.name,
        description=kb.description,
        status=kb.status,
        created_at=kb.created_at,
        updated_at=kb.updated_at,
        document_count=document_count,
        ready_document_count=ready_document_count,
        visibility=kb.visibility,
        approval_status=kb.approval_status,
        review_note=kb.review_note,
    )


@router.post("", response_model=KnowledgeBaseResponse, status_code=201)
async def create_knowledge_base(
    body: KnowledgeBaseCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_creator),
):
    admin = is_admin_role(user.role)
    kb = KnowledgeBase(
        user_id=user.id,
        name=body.name.strip(),
        description=(body.description or "").strip() or None,
        status="active",
        visibility="platform_public" if admin else "private",
        approval_status="approved" if admin else "pending",
    )
    db.add(kb)
    await db.commit()
    await db.refresh(kb)
    return _kb_response(kb, 0)


@router.get("", response_model=list[KnowledgeBaseResponse])
async def list_knowledge_bases(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_creator),
):
    """Admins see all KBs; creators see only KBs they own."""
    count_sq = (
        select(
            KnowledgeDocument.kb_id,
            func.count(KnowledgeDocument.id).label("cnt"),
            func.count(KnowledgeDocument.id)
            .filter(KnowledgeDocument.status == "ready")
            .label("ready_cnt"),
        )
        .group_by(KnowledgeDocument.kb_id)
        .subquery()
    )
    query = (
        select(
            KnowledgeBase,
            func.coalesce(count_sq.c.cnt, 0),
            func.coalesce(count_sq.c.ready_cnt, 0),
        )
        .outerjoin(count_sq, count_sq.c.kb_id == KnowledgeBase.id)
        .order_by(KnowledgeBase.updated_at.desc())
    )
    if not is_admin_role(user.role):
        query = query.where(KnowledgeBase.user_id == user.id)
    result = await db.execute(query)
    rows = result.all()
    return [_kb_response(kb, int(cnt), int(ready)) for kb, cnt, ready in rows]


@router.get("/selectable", response_model=list[KnowledgeBaseResponse])
async def list_selectable_knowledge_bases(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    count_sq = (
        select(
            KnowledgeDocument.kb_id,
            func.count(KnowledgeDocument.id).label("cnt"),
        )
        .where(KnowledgeDocument.status == "ready")
        .group_by(KnowledgeDocument.kb_id)
        .subquery()
    )
    conditions = [KnowledgeBase.status == "active"]
    if not is_admin_role(user.role):
        conditions.append(
            (KnowledgeBase.user_id == user.id)
            | (KnowledgeBase.visibility == "platform_public")
        )
    query = (
        select(KnowledgeBase, count_sq.c.cnt)
        .join(count_sq, count_sq.c.kb_id == KnowledgeBase.id)
        .where(*conditions)
        .order_by(KnowledgeBase.name)
    )
    rows = (await db.execute(query)).all()
    # 最终可选性以 is_selectable_knowledge_base 为准，避免与生成侧的授权判断分叉。
    return [
        _kb_response(kb, int(count), int(count))
        for kb, count in rows
        if is_selectable_knowledge_base(kb, user)
    ]


@router.post("/{kb_id}/submit-review", response_model=KnowledgeBaseResponse)
async def submit_knowledge_base_review(
    kb_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_creator),
):
    kb = await _get_kb(db, kb_id, user)
    if is_admin_role(user.role):
        raise HTTPException(status_code=409, detail="管理员知识库无需提交审核")
    kb.visibility = "private"
    kb.approval_status = "pending"
    kb.review_note = None
    kb.reviewed_by = None
    kb.reviewed_at = None
    await db.commit()
    await db.refresh(kb)
    count = await db.scalar(
        select(func.count(KnowledgeDocument.id)).where(
            KnowledgeDocument.kb_id == kb.id
        )
    )
    ready = await db.scalar(
        select(func.count(KnowledgeDocument.id)).where(
            KnowledgeDocument.kb_id == kb.id,
            KnowledgeDocument.status == "ready",
        )
    )
    return _kb_response(kb, int(count or 0), int(ready or 0))


@router.patch("/admin/{kb_id}/review", response_model=KnowledgeBaseResponse)
async def review_knowledge_base(
    kb_id: uuid.UUID,
    body: KnowledgeBaseReviewUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    kb = await _get_kb(db, kb_id)
    kb.reviewed_by = admin.id
    kb.reviewed_at = datetime.now(timezone.utc)
    kb.review_note = (body.note or "").strip() or None
    if body.decision == "approve":
        kb.approval_status = "approved"
        kb.visibility = "platform_public" if body.platform_public else "private"
    else:
        kb.approval_status = "rejected"
        kb.visibility = "private"
    await db.commit()
    await db.refresh(kb)
    count = await db.scalar(
        select(func.count(KnowledgeDocument.id)).where(
            KnowledgeDocument.kb_id == kb.id
        )
    )
    ready = await db.scalar(
        select(func.count(KnowledgeDocument.id)).where(
            KnowledgeDocument.kb_id == kb.id,
            KnowledgeDocument.status == "ready",
        )
    )
    return _kb_response(kb, int(count or 0), int(ready or 0))


@router.get("/{kb_id}", response_model=KnowledgeBaseDetailResponse)
async def get_knowledge_base(
    kb_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_creator),
):
    result = await db.execute(
        select(KnowledgeBase)
        .options(selectinload(KnowledgeBase.documents))
        .where(KnowledgeBase.id == kb_id)
    )
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if not can_manage_knowledge_base(kb, user):
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
        ready_document_count=sum(doc.status == "ready" for doc in docs),
        visibility=kb.visibility,
        approval_status=kb.approval_status,
        review_note=kb.review_note,
        documents=[KnowledgeDocumentResponse.model_validate(d) for d in docs],
    )


@router.patch("/{kb_id}", response_model=KnowledgeBaseResponse)
async def update_knowledge_base(
    kb_id: uuid.UUID,
    body: KnowledgeBaseUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_creator),
):
    kb = await _get_kb(db, kb_id, user)
    if body.name is not None:
        kb.name = body.name.strip()
    if body.description is not None:
        kb.description = body.description.strip() or None
    _mark_creator_change_pending(kb, user)
    await db.commit()
    await db.refresh(kb)
    count = await db.scalar(
        select(func.count()).select_from(KnowledgeDocument).where(KnowledgeDocument.kb_id == kb.id)
    )
    ready = await db.scalar(
        select(func.count()).select_from(KnowledgeDocument).where(
            KnowledgeDocument.kb_id == kb.id,
            KnowledgeDocument.status == "ready",
        )
    )
    return _kb_response(kb, int(count or 0), int(ready or 0))


@router.delete("/{kb_id}", status_code=204)
async def delete_knowledge_base(
    kb_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_creator),
):
    result = await db.execute(
        select(KnowledgeBase)
        .options(selectinload(KnowledgeBase.documents))
        .where(KnowledgeBase.id == kb_id)
    )
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if not can_manage_knowledge_base(kb, user):
        raise HTTPException(status_code=404, detail="知识库不存在")
    if not can_delete_knowledge_base(kb, user):
        raise HTTPException(
            status_code=409, detail="平台公开知识库属于共享资源，请联系管理员删除"
        )

    references = await db.scalar(
        select(func.count())
        .select_from(course_version_knowledge_bases)
        .where(course_version_knowledge_bases.c.kb_id == kb.id)
    )
    if references:
        raise HTTPException(status_code=409, detail="知识库已被课程版本引用，不能删除")
    storage_paths = [doc.storage_path for doc in kb.documents]
    arq_job_ids = await cancel_document_jobs(db, [str(doc.id) for doc in kb.documents])
    for doc in list(kb.documents):
        await delete_document_files_and_chunks(db, doc)
    await db.delete(kb)
    await db.commit()
    await abort_queued_jobs(arq_job_ids)
    for storage_path in storage_paths:
        cleanup_document_file(storage_path)
    return None


@router.post("/{kb_id}/documents", response_model=BackgroundJobResponse, status_code=202)
async def upload_document(
    kb_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_creator),
):
    kb = await _get_kb(db, kb_id, user)
    _mark_creator_change_pending(kb, user)
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
    user: User = Depends(require_creator),
):
    kb = await _get_kb(db, kb_id, user)
    result = await db.execute(
        select(KnowledgeDocument).where(
            KnowledgeDocument.id == doc_id,
            KnowledgeDocument.kb_id == kb_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    _mark_creator_change_pending(kb, user)
    arq_job_ids = await cancel_document_jobs(db, [str(doc_id)])
    storage_path = doc.storage_path
    await delete_document_files_and_chunks(db, doc)
    await db.commit()
    await abort_queued_jobs(arq_job_ids)
    cleanup_document_file(storage_path)
    return None
