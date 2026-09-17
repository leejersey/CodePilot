"""WebSocket JWT authentication and conversation authorization."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_token
from app.models.models import Conversation, User
from app.services.course_access import can_access_legacy_chapter


class WebSocketAuthError(Exception):
    def __init__(self, close_code: int, message: str):
        super().__init__(message)
        self.close_code = close_code
        self.message = message


def extract_websocket_token(data: object) -> str:
    if not isinstance(data, dict) or data.get("type") != "auth":
        raise WebSocketAuthError(4401, "请先完成 WebSocket 身份验证")
    token = data.get("token")
    if not isinstance(token, str) or not token.strip():
        raise WebSocketAuthError(4401, "请先完成 WebSocket 身份验证")
    return token


async def authenticate_websocket(
    db: AsyncSession,
    conversation_id: uuid.UUID,
    token: str,
) -> tuple[User, Conversation]:
    payload = verify_token(token)
    if not payload or "sub" not in payload:
        raise WebSocketAuthError(4401, "登录状态无效或已过期")

    try:
        user_id = uuid.UUID(payload["sub"])
    except (TypeError, ValueError, AttributeError):
        raise WebSocketAuthError(4401, "登录状态无效或已过期") from None

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise WebSocketAuthError(4401, "用户不存在或登录状态已失效")
    if getattr(user, "status", "active") != "active":
        raise WebSocketAuthError(4403, "账号已被禁用")
    if payload.get("auth_version") != getattr(user, "auth_version", 1):
        raise WebSocketAuthError(4401, "登录状态已失效，请重新登录")

    conversation_result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conversation = conversation_result.scalar_one_or_none()
    if not conversation:
        raise WebSocketAuthError(4404, "对话不存在")
    if conversation.user_id != user.id:
        raise WebSocketAuthError(4403, "无权访问该对话")
    chapter_id = getattr(conversation, "chapter_id", None)
    if chapter_id and not await can_access_legacy_chapter(
        db,
        chapter_id,
        user,
        require_enrollment=True,
    ):
        raise WebSocketAuthError(4403, "未加入课程或无权访问该章节")

    return user, conversation
