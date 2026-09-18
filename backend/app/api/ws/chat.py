"""WebSocket 流式对话端点"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.database import AsyncSessionLocal
from app.models.models import Chapter, Conversation, LearningPath, Message
from app.services.chat import detect_language_from_context, stream_chat_response
from app.services.chat_images import (
    compose_stored_user_text,
    normalize_chat_images,
    persist_chat_images,
)
from app.services.llm import llm_user_context
from app.services.kb_retrieve import (
    format_retrieval_context,
    list_platform_ready_kb_ids,
    retrieve_chunks,
)
from app.services.ws_auth import (
    WebSocketAuthError,
    authenticate_websocket,
    extract_websocket_token,
)

logger = logging.getLogger(__name__)
router = APIRouter()


async def _build_chapter_context(
    db, conv: Conversation
) -> tuple[str | None, list[uuid.UUID], str]:
    """返回 (章节上下文, 知识库IDs, 检索查询种子)。"""
    if not conv.chapter_id:
        return None, [], ""

    result = await db.execute(
        select(Chapter)
        .options(
            selectinload(Chapter.path).selectinload(LearningPath.knowledge_bases)
        )
        .where(Chapter.id == conv.chapter_id)
    )
    chapter = result.scalar_one_or_none()
    if not chapter:
        return None, [], ""

    path: LearningPath | None = chapter.path
    topic = path.topic if path else ""
    language = detect_language_from_context(
        topic,
        chapter.title,
        chapter.summary,
    )
    parts = [
        f"学习路径主题：{topic or '未指定'}",
        f"编程语言：{language}（所有代码示例必须使用此语言）",
        f"当前章节：{chapter.title}",
    ]
    if chapter.summary:
        parts.append(f"章节摘要：{chapter.summary}")
    if path and path.difficulty:
        parts.append(f"难度：{path.difficulty}")

    kb_ids: list[uuid.UUID] = []
    if path and path.knowledge_bases:
        kb_ids = [kb.id for kb in path.knowledge_bases]
        parts.append(f"已绑定知识库数量：{len(kb_ids)}")
        parts.append("本课程依赖知识库资料，请严格按资料讲解。")
    else:
        # 路径未绑定时回退到平台已就绪知识库
        kb_ids = await list_platform_ready_kb_ids(db)
        if kb_ids:
            parts.append(f"路径未显式绑定知识库，已自动使用平台知识库 {len(kb_ids)} 个。")
            parts.append("本课程应依赖这些知识库资料讲解。")

    query_seed = f"{topic} {chapter.title} {chapter.summary or ''}".strip()
    return "\n".join(parts), kb_ids, query_seed


@router.websocket("/chat/{conv_id}")
async def websocket_chat(websocket: WebSocket, conv_id: uuid.UUID):
    await websocket.accept()

    try:
        async with AsyncSessionLocal() as db:
            auth_data = await asyncio.wait_for(websocket.receive_json(), timeout=5)
            token = extract_websocket_token(auth_data)
            chat_user, conv = await authenticate_websocket(
                db, conv_id, token
            )
            await websocket.send_json({"type": "authenticated"})

            base_context, kb_ids, query_seed = await _build_chapter_context(db, conv)

            # 取最近 20 条，保证长对话续聊时模型仍有近期上下文
            msg_result = await db.execute(
                select(Message)
                .where(Message.conversation_id == conv_id)
                .order_by(Message.created_at.desc())
                .limit(20)
            )
            history = [
                {"role": m.role, "content": m.content}
                for m in reversed(list(msg_result.scalars().all()))
            ]

            while True:
                data = await websocket.receive_json()
                if data.get("type") != "message":
                    continue

                user_content = data.get("content", "").strip()
                images = normalize_chat_images(data.get("images"))
                if not user_content and not images:
                    continue

                stored_content = compose_stored_user_text(user_content, len(images))
                image_meta = persist_chat_images(
                    images,
                    user_id=str(chat_user.id),
                    conversation_id=str(conv_id),
                )

                doc_context = data.get("doc_context")
                doc_ctx_text = ""
                if isinstance(doc_context, dict):
                    parts = ["【文档学习模式 — 当前阅读上下文】"]
                    src = doc_context.get("source_label") or doc_context.get("source")
                    if src:
                        parts.append(f"来源：{src}")
                    st_title = doc_context.get("stage_title")
                    if st_title:
                        parts.append(f"当前阶段：{st_title}")
                    st_content = (doc_context.get("stage_content") or "").strip()
                    if st_content:
                        # 控制长度，避免撑爆上下文
                        parts.append("阶段正文：\n" + st_content[:6000])
                    selection = (doc_context.get("selection") or "").strip()
                    if selection:
                        parts.append("用户选中的片段：\n" + selection[:2000])
                    doc_ctx_text = "\n".join(parts)

                user_msg = Message(
                    conversation_id=conv_id,
                    role="user",
                    content=stored_content,
                    metadata_={"images": image_meta} if image_meta else None,
                )
                db.add(user_msg)
                await db.flush()

                history.append({"role": "user", "content": stored_content})

                chapter_context = base_context
                if doc_ctx_text:
                    chapter_context = (
                        f"{base_context}\n\n{doc_ctx_text}" if base_context else doc_ctx_text
                    )
                if kb_ids:
                    try:
                        # 引导语很长时，用章节主题检索更稳；普通提问拼上章节种子
                        rag_query_text = user_content or stored_content
                        is_guide = len(rag_query_text) > 120 and "学习页面" in rag_query_text
                        query = query_seed if is_guide else f"{query_seed}\n{rag_query_text}"
                        if doc_context and isinstance(doc_context, dict):
                            extra = " ".join(
                                filter(
                                    None,
                                    [
                                        doc_context.get("stage_title"),
                                        (doc_context.get("selection") or "")[:200],
                                    ],
                                )
                            )
                            if extra:
                                query = f"{query}\n{extra}"
                        chunks = await asyncio.wait_for(
                            retrieve_chunks(
                                db, kb_ids=kb_ids, query=query, top_k=6
                            ),
                            timeout=8.0,
                        )
                        rag_text = format_retrieval_context(chunks)
                        if rag_text:
                            chapter_context = (
                                f"{chapter_context}\n\n{rag_text}"
                                if chapter_context
                                else rag_text
                            )
                        else:
                            logger.info("RAG returned 0 chunks for conv=%s query=%s", conv_id, query[:80])
                    except Exception as e:
                        logger.warning("RAG retrieve failed: %s", e)

                full_response = ""
                try:
                    with llm_user_context(chat_user):
                        async for token in stream_chat_response(
                            history,
                            chapter_context=chapter_context,
                            images=images or None,
                        ):
                            full_response += token
                            await websocket.send_json(
                                {"type": "token", "content": token}
                            )
                except Exception as e:
                    logger.exception("LLM stream failed for conv=%s", conv_id)
                    await websocket.send_json(
                        {
                            "type": "error",
                            "code": "LLM_ERROR",
                            "message": f"模型回复失败: {e}",
                        }
                    )
                    # 回滚本轮仅写入的用户消息状态由后续提交覆盖；先不阻塞会话
                    await db.commit()
                    continue

                if not full_response.strip():
                    await websocket.send_json(
                        {
                            "type": "error",
                            "code": "LLM_EMPTY",
                            "message": "模型返回了空内容，请检查个人中心的模型配置后重试",
                        }
                    )
                    await db.commit()
                    continue

                ai_msg = Message(
                    conversation_id=conv_id,
                    role="assistant",
                    content=full_response,
                    token_count=len(full_response) // 4,
                )
                db.add(ai_msg)
                conv.updated_at = datetime.now(timezone.utc)
                await db.commit()

                history.append({"role": "assistant", "content": full_response})

                await websocket.send_json({
                    "type": "done",
                    "message_id": str(ai_msg.id),
                    "token_count": ai_msg.token_count,
                })

    except WebSocketDisconnect:
        pass
    except asyncio.TimeoutError:
        await websocket.send_json({
            "type": "error",
            "code": "AUTH_TIMEOUT",
            "message": "WebSocket 身份验证超时",
        })
        await websocket.close(code=4401)
    except WebSocketAuthError as e:
        await websocket.send_json({
            "type": "error",
            "code": {
                4401: "UNAUTHORIZED",
                4403: "FORBIDDEN",
                4404: "NOT_FOUND",
            }.get(e.close_code, "UNAUTHORIZED"),
            "message": e.message,
        })
        await websocket.close(code=e.close_code)
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "code": "INTERNAL", "message": str(e)})
        except Exception:
            pass
