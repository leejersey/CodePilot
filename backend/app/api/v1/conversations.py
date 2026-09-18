import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.core.deps import get_current_user
from app.models.models import Conversation, Message, User
from app.schemas.schemas import ConversationCreate, ConversationResponse, MessageResponse
from app.services.course_access import can_access_legacy_chapter
from app.services.tos_storage import enrich_image_metadata

router = APIRouter()


def _serialize_message(message: Message) -> MessageResponse:
    meta = enrich_image_metadata(message.metadata_)
    return MessageResponse(
        id=message.id,
        conversation_id=message.conversation_id,
        role=message.role,
        content=message.content,
        token_count=message.token_count,
        created_at=message.created_at,
        metadata=meta,
    )


@router.post("", response_model=ConversationResponse, status_code=201)
async def create_conversation(
    body: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.chapter_id and not await can_access_legacy_chapter(
        db,
        body.chapter_id,
        user,
        require_enrollment=True,
    ):
        raise HTTPException(status_code=403, detail="未加入课程或无权访问该章节")
    conv = Conversation(
        user_id=user.id,
        chapter_id=body.chapter_id,
        title=body.title,
    )
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return conv


@router.get("/by-chapter/{chapter_id}", response_model=ConversationResponse)
async def get_conversation_by_chapter(
    chapter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """返回当前用户在该章节下最值得恢复的对话（优先有消息的）。"""
    msg_count = (
        select(Message.conversation_id, func.count(Message.id).label("cnt"))
        .group_by(Message.conversation_id)
        .subquery()
    )
    result = await db.execute(
        select(Conversation)
        .outerjoin(msg_count, Conversation.id == msg_count.c.conversation_id)
        .where(Conversation.user_id == user.id)
        .where(Conversation.chapter_id == chapter_id)
        .order_by(
            func.coalesce(msg_count.c.cnt, 0).desc(),
            Conversation.updated_at.desc(),
        )
        .limit(1)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="该章节暂无对话")
    return conv


@router.get("/{conv_id}", response_model=ConversationResponse)
async def get_conversation(
    conv_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conv_id)
        .where(Conversation.user_id == user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="对话不存在")
    return conv


@router.get("/{conv_id}/messages", response_model=list[MessageResponse])
async def get_messages(
    conv_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    owned = await db.execute(
        select(Conversation.id)
        .where(Conversation.id == conv_id)
        .where(Conversation.user_id == user.id)
    )
    if not owned.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="对话不存在")

    result = await db.execute(
        select(Message).where(Message.conversation_id == conv_id).order_by(Message.created_at)
    )
    return [_serialize_message(item) for item in result.scalars().all()]
