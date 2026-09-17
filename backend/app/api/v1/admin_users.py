"""超级管理员账号管理 API。"""

import uuid
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_super_admin
from app.core.security import hash_password
from app.db.database import get_db
from app.models.models import User
from app.schemas.schemas import (
    AdminUserListResponse,
    AdminUserResponse,
    UserAccountStatusUpdate,
    UserPasswordReset,
    UserRoleUpdate,
)

router = APIRouter()


def validate_account_change(
    actor: Any,
    target: Any,
    *,
    new_role: str | None = None,
    new_status: str | None = None,
    reset_password: bool = False,
) -> None:
    if actor.id == target.id and new_status == "disabled":
        raise HTTPException(status_code=400, detail="不能禁用当前账号")
    if actor.id == target.id and new_role and new_role != "super_admin":
        raise HTTPException(status_code=400, detail="不能降低当前账号权限")
    if reset_password and target.auth_provider == "anonymous":
        raise HTTPException(status_code=400, detail="匿名账号不支持重置密码")


async def _get_user(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user


async def _ensure_not_last_super_admin(
    db: AsyncSession,
    target: User,
    *,
    removes_access: bool,
) -> None:
    if target.role != "super_admin" or target.status != "active" or not removes_access:
        return
    locked_ids = list(
        (
            await db.execute(
                select(User.id)
                .where(
                    User.role == "super_admin",
                    User.status == "active",
                )
                .order_by(User.id)
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    if target.id not in locked_ids:
        return
    if len(locked_ids) <= 1:
        raise HTTPException(status_code=400, detail="必须保留至少一个启用的超级管理员")


@router.get("", response_model=AdminUserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    keyword: str | None = Query(None, max_length=100),
    role: Literal["learner", "creator", "admin", "super_admin"] | None = None,
    status: Literal["active", "disabled"] | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    filters = []
    if keyword and keyword.strip():
        pattern = f"%{keyword.strip()}%"
        filters.append(or_(User.email.ilike(pattern), User.nickname.ilike(pattern)))
    if role:
        filters.append(User.role == role)
    if status:
        filters.append(User.status == status)

    total = await db.scalar(select(func.count(User.id)).where(*filters))
    result = await db.execute(
        select(User)
        .where(*filters)
        .order_by(User.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    role_counts = dict(
        (await db.execute(select(User.role, func.count(User.id)).group_by(User.role))).all()
    )
    status_counts = dict(
        (await db.execute(select(User.status, func.count(User.id)).group_by(User.status))).all()
    )
    return AdminUserListResponse(
        items=list(result.scalars().all()),
        total=total or 0,
        page=page,
        page_size=page_size,
        stats={
            "total": sum(role_counts.values()),
            "super_admin": role_counts.get("super_admin", 0),
            "admin": role_counts.get("admin", 0),
            "creator": role_counts.get("creator", 0),
            "learner": role_counts.get("learner", 0),
            "active": status_counts.get("active", 0),
            "disabled": status_counts.get("disabled", 0),
        },
    )


@router.patch("/{user_id}/role", response_model=AdminUserResponse)
async def update_user_role(
    user_id: uuid.UUID,
    body: UserRoleUpdate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_super_admin),
):
    target = await _get_user(db, user_id)
    validate_account_change(actor, target, new_role=body.role)
    await _ensure_not_last_super_admin(
        db,
        target,
        removes_access=body.role != "super_admin",
    )
    if target.role != body.role:
        target.role = body.role
        target.auth_version += 1
        await db.commit()
        await db.refresh(target)
    return target


@router.patch("/{user_id}/status", response_model=AdminUserResponse)
async def update_user_status(
    user_id: uuid.UUID,
    body: UserAccountStatusUpdate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_super_admin),
):
    target = await _get_user(db, user_id)
    validate_account_change(actor, target, new_status=body.status)
    await _ensure_not_last_super_admin(
        db,
        target,
        removes_access=body.status == "disabled",
    )
    if target.status != body.status:
        target.status = body.status
        target.auth_version += 1
        await db.commit()
        await db.refresh(target)
    return target


@router.post("/{user_id}/reset-password", response_model=AdminUserResponse)
async def reset_user_password(
    user_id: uuid.UUID,
    body: UserPasswordReset,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_super_admin),
):
    target = await _get_user(db, user_id)
    validate_account_change(actor, target, reset_password=True)
    target.hashed_password = hash_password(body.temporary_password)
    target.auth_version += 1
    await db.commit()
    await db.refresh(target)
    return target
