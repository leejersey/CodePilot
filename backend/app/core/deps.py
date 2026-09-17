"""核心依赖注入模块"""

import uuid
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.models import User
from app.core.security import verify_token


ADMIN_ROLES = frozenset({"admin", "super_admin"})
CREATOR_ROLES = frozenset({"creator", "admin", "super_admin"})


def is_admin_role(role: str | None) -> bool:
    return role in ADMIN_ROLES


def is_creator_role(role: str | None) -> bool:
    return role in CREATOR_ROLES


def is_super_admin_role(role: str | None) -> bool:
    return role == "super_admin"


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(None),
    x_anonymous_id: str | None = Header(None, alias="X-Anonymous-ID"),
) -> User:
    """Authenticate registered and anonymous users only through signed JWTs."""
    _ = x_anonymous_id  # Explicitly ignored; retained only for graceful old-client rejection.
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="请先获取签名登录会话")

    token = authorization[7:]
    payload = verify_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Token 无效或已过期")
    try:
        user_id = uuid.UUID(payload["sub"])
    except (TypeError, ValueError, AttributeError):
        raise HTTPException(status_code=401, detail="Token 无效或已过期") from None
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    if getattr(user, "status", "active") != "active":
        raise HTTPException(status_code=403, detail="账号已被禁用")
    if payload.get("auth_version") != getattr(user, "auth_version", 1):
        raise HTTPException(status_code=401, detail="登录状态已失效，请重新登录")
    return user


async def get_optional_user(
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(None),
    x_anonymous_id: str | None = Header(None, alias="X-Anonymous-ID"),
) -> User | None:
    """Return a requester when credentials are supplied, without creating guests."""
    if not authorization:
        return None
    return await get_current_user(
        db=db,
        authorization=authorization,
        x_anonymous_id=x_anonymous_id,
    )


async def require_admin(user: User = Depends(get_current_user)) -> User:
    """仅管理员可访问。"""
    if not is_admin_role(getattr(user, "role", None)):
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user


async def require_creator(user: User = Depends(get_current_user)) -> User:
    """Creator accounts and administrators may manage creator courses."""
    if getattr(user, "auth_provider", None) == "anonymous":
        raise HTTPException(status_code=403, detail="匿名账号不能创建课程")
    if not is_creator_role(getattr(user, "role", None)):
        raise HTTPException(status_code=403, detail="需要创作者权限")
    return user


async def require_super_admin(user: User = Depends(get_current_user)) -> User:
    """仅超级管理员可访问。"""
    if not is_super_admin_role(getattr(user, "role", None)):
        raise HTTPException(status_code=403, detail="需要超级管理员权限")
    return user
