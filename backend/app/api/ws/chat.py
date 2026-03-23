"""WebSocket 流式对话端点"""

import uuid
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.db.database import AsyncSessionLocal
from app.models.models import Conversation, Message
from app.services.chat import stream_chat_response

router = APIRouter()


@router.websocket("/chat/{conv_id}")
async def websocket_chat(websocket: WebSocket, conv_id: uuid.UUID):
    await websocket.accept()

    try:
        async with AsyncSessionLocal() as db:
            # 验证对话是否存在
            result = await db.execute(select(Conversation).where(Conversation.id == conv_id))
            conv = result.scalar_one_or_none()
            if not conv:
                await websocket.send_json({"type": "error", "code": "NOT_FOUND", "message": "对话不存在"})
                await websocket.close()
                return

            # 加载历史消息
            msg_result = await db.execute(
                select(Message)
                .where(Message.conversation_id == conv_id)
                .order_by(Message.created_at)
                .limit(20)
            )
            history = [
                {"role": m.role, "content": m.content}
                for m in msg_result.scalars().all()
            ]

            while True:
                # 接收用户消息
                data = await websocket.receive_json()
                if data.get("type") != "message":
                    continue

                user_content = data.get("content", "").strip()
                if not user_content:
                    continue

                # 保存用户消息
                user_msg = Message(
                    conversation_id=conv_id,
                    role="user",
                    content=user_content,
                )
                db.add(user_msg)
                await db.flush()

                history.append({"role": "user", "content": user_content})

                # 流式生成 AI 响应
                full_response = ""
                async for token in stream_chat_response(history):
                    full_response += token
                    await websocket.send_json({"type": "token", "content": token})

                # 保存 AI 响应
                ai_msg = Message(
                    conversation_id=conv_id,
                    role="assistant",
                    content=full_response,
                    token_count=len(full_response) // 4,
                )
                db.add(ai_msg)
                await db.commit()

                history.append({"role": "assistant", "content": full_response})

                # 发送完成标记
                await websocket.send_json({
                    "type": "done",
                    "message_id": str(ai_msg.id),
                    "token_count": ai_msg.token_count,
                })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "code": "INTERNAL", "message": str(e)})
        except Exception:
            pass
