"""Redis fixed-window rate limiting for REST API traffic."""

import logging
import time
from typing import Any

from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.security import verify_token
from app.db.redis import get_redis

logger = logging.getLogger(__name__)


def _identity(scope: dict[str, Any]) -> str:
    client = scope.get("client")
    ip_identity = f"ip:{client[0] if client else 'unknown'}"
    if scope.get("path") == "/api/v1/auth/anonymous":
        return ip_identity
    headers = {
        key.decode("latin1").lower(): value.decode("latin1")
        for key, value in scope.get("headers", [])
    }
    authorization = headers.get("authorization", "")
    if authorization.startswith("Bearer "):
        payload = verify_token(authorization[7:])
        if payload and payload.get("sub"):
            return f"user:{payload['sub']}"
    return ip_identity


class ApiRateLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if (
            scope["type"] != "http"
            or not scope.get("path", "").startswith("/api/")
            or scope.get("method") == "OPTIONS"
        ):
            await self.app(scope, receive, send)
            return

        limit = get_settings().API_RATE_LIMIT_PER_MINUTE
        remaining = limit
        try:
            redis = await get_redis()
            window = int(time.time() // 60)
            key = f"codepilot:api:rate:{_identity(scope)}:{window}"
            count = await redis.incr(key)
            if count == 1:
                await redis.expire(key, 120)
            remaining = max(0, limit - count)
            if count > limit:
                response = JSONResponse(
                    status_code=429,
                    content={"detail": "API 请求过于频繁，请稍后重试"},
                    headers={
                        "Retry-After": "60",
                        "X-RateLimit-Limit": str(limit),
                        "X-RateLimit-Remaining": "0",
                    },
                )
                await response(scope, receive, send)
                return
        except Exception as exc:
            logger.warning("API rate limiter unavailable: %s", exc)

        async def send_with_rate_headers(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend([
                    (b"x-ratelimit-limit", str(limit).encode()),
                    (b"x-ratelimit-remaining", str(remaining).encode()),
                ])
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_rate_headers)
