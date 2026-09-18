"""火山引擎 TOS 对象存储（对话图片等）。"""

from __future__ import annotations

import logging
import uuid
from functools import lru_cache
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# 预签名读链接默认 7 天，覆盖常见「隔几天回来续学」场景。
PRESIGN_EXPIRES_SECONDS = 7 * 24 * 3600


def tos_configured() -> bool:
    s = get_settings()
    return bool(
        s.TOS_ACCESS_KEY.strip()
        and s.TOS_SECRET_KEY.strip()
        and s.TOS_ENDPOINT.strip()
        and s.TOS_REGION.strip()
        and s.TOS_BUCKET.strip()
    )


@lru_cache
def _client():
    if not tos_configured():
        return None
    try:
        import tos
    except ImportError:
        logger.warning("tos SDK not installed; chat image persistence disabled")
        return None
    s = get_settings()
    return tos.TosClientV2(
        s.TOS_ACCESS_KEY.strip(),
        s.TOS_SECRET_KEY.strip(),
        s.TOS_ENDPOINT.strip(),
        s.TOS_REGION.strip(),
    )


def _public_url(key: str) -> str | None:
    s = get_settings()
    base = s.TOS_PUBLIC_BASE_URL.strip().rstrip("/")
    if base:
        return f"{base}/{key}"
    return None


def _presign_get_url(key: str) -> str | None:
    client = _client()
    if not client:
        return None
    try:
        import tos

        s = get_settings()
        out = client.pre_signed_url(
            tos.HttpMethodType.Http_Method_Get,
            s.TOS_BUCKET.strip(),
            key,
            expires=PRESIGN_EXPIRES_SECONDS,
        )
        return getattr(out, "signed_url", None) or getattr(out, "url", None)
    except Exception:
        logger.exception("TOS pre-sign failed for key=%s", key)
        return None


def resolve_object_url(key: str) -> str | None:
    return _public_url(key) or _presign_get_url(key)


def upload_bytes(
    *,
    data: bytes,
    content_type: str,
    key_prefix: str = "chat-images",
    extension: str = "bin",
) -> dict[str, str] | None:
    """上传二进制到 TOS。成功返回 {key, url, mime}；未配置或失败返回 None。"""
    client = _client()
    if not client:
        return None
    s = get_settings()
    ext = extension.lstrip(".") or "bin"
    key = f"{key_prefix.strip('/')}/{uuid.uuid4().hex}.{ext}"
    try:
        client.put_object(
            s.TOS_BUCKET.strip(),
            key,
            content=data,
            content_type=content_type or "application/octet-stream",
        )
    except Exception:
        logger.exception("TOS put_object failed key=%s", key)
        return None
    url = resolve_object_url(key)
    if not url:
        logger.warning("TOS upload ok but no public/presigned URL for key=%s", key)
        return None
    return {"key": key, "url": url, "mime": content_type}


def enrich_image_metadata(metadata: dict[str, Any] | None) -> dict[str, Any] | None:
    """读取消息时刷新图片 URL（私有桶预签名会过期）。"""
    if not metadata or not isinstance(metadata, dict):
        return metadata
    images = metadata.get("images")
    if not isinstance(images, list) or not images:
        return metadata
    refreshed: list[dict[str, Any]] = []
    changed = False
    for item in images:
        if not isinstance(item, dict):
            continue
        next_item = dict(item)
        key = (item.get("key") or "").strip()
        if key and tos_configured():
            url = resolve_object_url(key)
            if url and url != item.get("url"):
                next_item["url"] = url
                changed = True
        refreshed.append(next_item)
    if not changed:
        return metadata
    return {**metadata, "images": refreshed}
