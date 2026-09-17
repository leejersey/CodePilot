"""ASGI request tracing and unhandled exception capture."""

import logging
import time
import uuid
from typing import Any

from fastapi.responses import JSONResponse

from app.core.security import verify_token
from app.services.observability import (
    capture_exception,
    new_error_id,
    persist_error,
    request_id_context,
    send_alert,
    track_server_error_burst,
)

logger = logging.getLogger("codepilot.request")


def _request_identity(scope: dict[str, Any]) -> uuid.UUID | None:
    headers = {
        key.decode("latin1").lower(): value.decode("latin1")
        for key, value in scope.get("headers", [])
    }
    authorization = headers.get("authorization", "")
    if not authorization.startswith("Bearer "):
        return None
    payload = verify_token(authorization[7:])
    try:
        return uuid.UUID(str(payload["sub"])) if payload and payload.get("sub") else None
    except ValueError:
        return None


class ObservabilityMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        started = time.perf_counter()
        headers = {
            key.decode("latin1").lower(): value.decode("latin1")
            for key, value in scope.get("headers", [])
        }
        request_id = headers.get("x-request-id", "")[:64] or uuid.uuid4().hex[:16]
        token = request_id_context.set(request_id)
        path = scope.get("path", "")
        method = scope.get("method", "")
        user_id = _request_identity(scope)
        status_code = 500
        response_started = False
        handled_error_id: str | None = None

        async def traced_send(message):
            nonlocal status_code, response_started, handled_error_id
            if message["type"] == "http.response.start":
                response_started = True
                status_code = int(message["status"])
                response_headers = list(message.get("headers", []))
                response_headers.append((b"x-request-id", request_id.encode()))
                if status_code >= 500:
                    handled_error_id = new_error_id()
                    response_headers.append((b"x-error-id", handled_error_id.encode()))
                message["headers"] = response_headers
            await send(message)

        try:
            await self.app(scope, receive, traced_send)
            if status_code >= 500 and handled_error_id:
                await persist_error(
                    error_id=handled_error_id,
                    service="api",
                    message=f"HTTP {status_code} response",
                    request_id=request_id,
                    user_id=user_id,
                    path=path,
                    method=method,
                    status_code=status_code,
                )
                await track_server_error_burst(path, status_code)
        except Exception as exc:
            error_id = new_error_id()
            capture_exception(exc, error_id=error_id)
            logger.exception(
                "Unhandled request exception",
                extra={
                    "request_id": request_id,
                    "error_id": error_id,
                    "method": method,
                    "path": path,
                    "status_code": 500,
                    "user_id": str(user_id) if user_id else None,
                },
            )
            await persist_error(
                error_id=error_id,
                service="api",
                message=str(exc) or type(exc).__name__,
                exception_type=type(exc).__name__,
                request_id=request_id,
                user_id=user_id,
                path=path,
                method=method,
                status_code=500,
            )
            await track_server_error_burst(path, 500)
            await send_alert(
                "CodePilot 未处理异常",
                f"{method} {path}: {type(exc).__name__}",
                dedup_key=f"exception:{type(exc).__name__}:{path}",
                details={"error_id": error_id, "request_id": request_id},
            )
            if response_started:
                raise
            response = JSONResponse(
                status_code=500,
                content={"detail": "服务器内部错误", "error_id": error_id},
                headers={"X-Request-ID": request_id, "X-Error-ID": error_id},
            )
            await response(scope, receive, send)
            status_code = 500
        finally:
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            logger.info(
                "HTTP request completed",
                extra={
                    "request_id": request_id,
                    "method": method,
                    "path": path,
                    "status_code": status_code,
                    "duration_ms": duration_ms,
                    "user_id": str(user_id) if user_id else None,
                },
            )
            request_id_context.reset(token)
