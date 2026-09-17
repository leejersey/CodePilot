"""对话图片附件校验与多模态消息组装。"""

from __future__ import annotations

import re
from typing import Any

_DATA_URL_RE = re.compile(
    r"^data:(image/(?:jpeg|png|gif|webp));base64,[A-Za-z0-9+/=\s]+$",
    re.IGNORECASE,
)

CHAT_IMAGE_MAX_COUNT = 4
# demo：单张 data URL 上限约 4MB 字符，避免撑爆 WebSocket。
CHAT_IMAGE_MAX_CHARS = 4_000_000


def normalize_chat_images(raw: Any) -> list[dict[str, str]]:
    """校验并规范化前端传来的图片列表。非法项直接丢弃；超限截断。"""
    if not isinstance(raw, list):
        return []
    images: list[dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        data_url = (item.get("dataUrl") or item.get("url") or "").strip()
        if not data_url or len(data_url) > CHAT_IMAGE_MAX_CHARS:
            continue
        if not _DATA_URL_RE.match(data_url):
            continue
        mime_match = re.match(r"^data:(image/[a-zA-Z0-9.+-]+);base64,", data_url, re.I)
        mime = (mime_match.group(1).lower() if mime_match else "").replace("image/jpg", "image/jpeg")
        images.append({"mime": mime, "url": data_url})
        if len(images) >= CHAT_IMAGE_MAX_COUNT:
            break
    return images


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
