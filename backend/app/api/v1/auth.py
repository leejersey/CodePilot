"""认证 API：注册 / 登录 / 获取当前用户"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.models import User
from app.schemas.schemas import (
    ChangePasswordRequest, RegisterRequest, LoginRequest, TokenResponse, UserResponse,
)
from app.core.security import hash_password, verify_password, create_access_token
from app.core.deps import get_current_user
from app.core.config import is_admin_email

router = APIRouter()


def _apply_admin_role(user: User) -> bool:
    """若邮箱在 ADMIN_EMAILS 中则晋升为超级管理员。"""
    if is_admin_email(user.email) and user.role != "super_admin":
        user.role = "super_admin"
        user.auth_version = (user.auth_version or 1) + 1
        return True
    return False


def _issue_token(user: User) -> str:
    return create_access_token({
        "sub": str(user.id),
        "auth_version": user.auth_version,
    })


@router.post("/anonymous", response_model=TokenResponse, status_code=201)
async def create_anonymous_session(db: AsyncSession = Depends(get_db)):
    """Create a server-owned anonymous identity with a short-lived signed token."""
    user = User(
        id=uuid.uuid4(),
        nickname="Learner",
        auth_provider="anonymous",
        role="learner",
        status="active",
        auth_version=1,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    token = create_access_token(
        {
            "sub": str(user.id),
            "auth_version": user.auth_version,
            "token_kind": "anonymous",
        },
        expires_hours=1,
    )
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """注册新用户"""
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="该邮箱已被注册")

    user = User(
        email=req.email,
        nickname=req.nickname,
        hashed_password=hash_password(req.password),
        auth_provider="email",
        role="super_admin" if is_admin_email(req.email) else "learner",
        status="active",
        auth_version=1,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = _issue_token(user)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    """邮箱密码登录"""
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password:
        raise HTTPException(status_code=401, detail="邮箱或密码错误")

    if not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="邮箱或密码错误")

    if user.status != "active":
        raise HTTPException(status_code=403, detail="账号已被禁用")

    if _apply_admin_role(user):
        await db.commit()
        await db.refresh(user)

    token = _issue_token(user)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
async def get_me(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """获取当前用户信息（顺带同步 ADMIN_EMAILS 晋升）"""
    if _apply_admin_role(user):
        await db.commit()
        await db.refresh(user)
    return user


@router.post("/change-password", response_model=TokenResponse)
async def change_password(
    req: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """校验当前密码后更新密码，并签发新 Token。"""
    if user.auth_provider != "email" or not user.hashed_password:
        raise HTTPException(status_code=400, detail="当前账号不支持密码修改")
    if not verify_password(req.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="当前密码错误")
    if verify_password(req.new_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="新密码不能与当前密码相同")

    user.hashed_password = hash_password(req.new_password)
    user.auth_version = (user.auth_version or 1) + 1
    await db.commit()
    await db.refresh(user)

    return TokenResponse(
        access_token=_issue_token(user),
        user=UserResponse.model_validate(user),
    )
