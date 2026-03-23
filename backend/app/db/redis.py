"""Redis 连接管理 + 缓存工具"""

import json
import hashlib
from typing import Any
from redis.asyncio import Redis
from app.core.config import get_settings

settings = get_settings()

# 全局 Redis 连接池
_redis: Redis | None = None


async def get_redis() -> Redis:
    """获取 Redis 连接（延迟初始化 + 单例）"""
    global _redis
    if _redis is None:
        _redis = Redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            max_connections=20,
        )
    return _redis


async def close_redis():
    """关闭 Redis 连接"""
    global _redis
    if _redis:
        await _redis.close()
        _redis = None


# ---------- 缓存工具函数 ----------

def _cache_key(prefix: str, *args: str) -> str:
    """生成缓存 key"""
    raw = ":".join(args)
    return f"codepilot:{prefix}:{raw}"


def _hash_key(content: str) -> str:
    """对长内容生成短 hash key"""
    return hashlib.md5(content.encode()).hexdigest()[:12]


async def cache_get(prefix: str, *args: str) -> Any | None:
    """获取缓存值（JSON 反序列化）"""
    r = await get_redis()
    key = _cache_key(prefix, *args)
    val = await r.get(key)
    if val is None:
        return None
    try:
        return json.loads(val)
    except json.JSONDecodeError:
        return val


async def cache_set(prefix: str, *args: str, value: Any, ttl: int = 3600):
    """设置缓存值（JSON 序列化，默认 1 小时过期）"""
    r = await get_redis()
    key = _cache_key(prefix, *args)
    serialized = json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value
    await r.set(key, serialized, ex=ttl)


async def cache_delete(prefix: str, *args: str):
    """删除缓存"""
    r = await get_redis()
    key = _cache_key(prefix, *args)
    await r.delete(key)


async def cache_delete_pattern(pattern: str):
    """按模式删除缓存"""
    r = await get_redis()
    full_pattern = f"codepilot:{pattern}"
    async for key in r.scan_iter(match=full_pattern):
        await r.delete(key)
