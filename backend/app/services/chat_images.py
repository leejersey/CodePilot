"""对话图片附件校验与多模态消息组装。"""

from __future__ import annotations

import base64
import logging
import re
from typing import Any

_DATA_URL_RE = re.compile(
    r"^data:(image/(?:jpeg|png|gif|webp));base64,[A-Za-z0-9+/=\s]+$",
    re.IGNORECASE,
)

CHAT_IMAGE_MAX_COUNT = 4
# 单张 data URL 上限约 4MB 字符，避免撑爆 WebSocket。
CHAT_IMAGE_MAX_CHARS = 4_000_000

logger = logging.getLogger(__name__)

_MIME_EXT = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
}


def normalize_chat_images(raw: Any) -> list[dict[str, str]]:
    """校验并规范化前端传来的图片列表。非法项直接丢弃；超限截断。"""
    if not isinstance(raw, list):
        return []
    images: list[dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        data_url = (item.get("dataUrl") or item.get("url") or "").strip()
        if not data_url.startswith("data:"):
            # 仅 data URL 可本轮送入多模态 LLM；已持久化的 https 由历史回放展示。
            continue
        if len(data_url) > CHAT_IMAGE_MAX_CHARS:
            continue
        if not _DATA_URL_RE.match(data_url):
            continue
        mime_match = re.match(r"^data:(image/[a-zA-Z0-9.+-]+);base64,", data_url, re.I)
        mime = (mime_match.group(1).lower() if mime_match else "").replace("image/jpg", "image/jpeg")
        images.append({"mime": mime, "url": data_url})
        if len(images) >= CHAT_IMAGE_MAX_COUNT:
            break
    return images


def decode_data_url(data_url: str) -> tuple[bytes, str] | None:
    if not _DATA_URL_RE.match(data_url or ""):
        return None
    mime_match = re.match(r"^data:(image/[a-zA-Z0-9.+-]+);base64,", data_url, re.I)
    mime = (mime_match.group(1).lower() if mime_match else "image/jpeg").replace(
        "image/jpg", "image/jpeg"
    )
    try:
        _, b64 = data_url.split(",", 1)
        return base64.b64decode(b64, validate=False), mime
    except Exception:
        logger.warning("failed to decode chat image data URL")
        return None


def persist_chat_images(
    images: list[dict[str, str]],
    *,
    user_id: str,
    conversation_id: str,
) -> list[dict[str, str]]:
    """将 data URL 图片上传到火山 TOS；失败项跳过。返回可写入 message.metadata 的列表。"""
    if not images:
        return []
    from app.services.tos_storage import tos_configured, upload_bytes

    if not tos_configured():
        return []

    stored: list[dict[str, str]] = []
    prefix = f"chat-images/{user_id}/{conversation_id}"
    for image in images:
        decoded = decode_data_url(image.get("url") or "")
        if not decoded:
            continue
        raw, mime = decoded
        uploaded = upload_bytes(
            data=raw,
            content_type=mime,
            key_prefix=prefix,
            extension=_MIME_EXT.get(mime, "bin"),
        )
        if not uploaded:
            continue
        stored.append(
            {
                "key": uploaded["key"],
                "url": uploaded["url"],
                "mime": uploaded["mime"],
            }
        )
    return stored


def default_image_prompt(image_count: int) -> str:
    if image_count <= 1:
        return "请分析这张截图中的报错或问题，给出原因和可执行的解决步骤。"
    return f"请分析这{image_count}张截图中的报错或问题，给出原因和可执行的解决步骤。"


def compose_stored_user_text(text: str, image_count: int) -> str:
    trimmed = (text or "").strip()
    if image_count <= 0:
        return trimmed
    body = trimmed or default_image_prompt(image_count)
    return f"{body}\n\n[已附 {image_count} 张图片]"


def build_user_content_for_llm(text: str, images: list[dict[str, str]]) -> str | list[dict[str, Any]]:
    """有图时返回 OpenAI 兼容的多模态 content；无图时返回纯字符串。"""
    trimmed = (text or "").strip() or (
        default_image_prompt(len(images)) if images else ""
    )
    if not images:
        return trimmed
    blocks: list[dict[str, Any]] = [{"type": "text", "text": trimmed}]
    for image in images:
        blocks.append(
            {
                "type": "image_url",
                "image_url": {"url": image["url"], "detail": "low"},
            }
        )
    return blocks
