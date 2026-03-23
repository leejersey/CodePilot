"""核心依赖注入模块"""

import uuid
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.models import User
from app.core.security import verify_token


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(None),
    x_anonymous_id: str | None = Header(None, alias="X-Anonymous-ID"),
) -> User:
    """
    获取当前用户。

    优先级：
    1. Authorization: Bearer <JWT> → 验证 Token，获取已注册用户
    2. X-Anonymous-ID: <uuid> → 匿名模式（向下兼容）
    3. 都没有 → 自动创建匿名用户
    """

    # ── 方式 1：JWT 认证 ──
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        payload = verify_token(token)
        if not payload or "sub" not in payload:
            raise HTTPException(status_code=401, detail="Token 无效或已过期")

        user_id = uuid.UUID(payload["sub"])
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=401, detail="用户不存在")
        return user

    # ── 方式 2：匿名模式（兼容 MVP）──
    if not x_anonymous_id:
        x_anonymous_id = str(uuid.uuid4())

    try:
        anon_uuid = uuid.UUID(x_anonymous_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="无效的 X-Anonymous-ID 格式")

    result = await db.execute(select(User).where(User.id == anon_uuid))
    user = result.scalar_one_or_none()

    if not user:
        user = User(id=anon_uuid, nickname="Learner", auth_provider="anonymous")
        db.add(user)
        await db.flush()

    return user
