import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.admin_users import _ensure_not_last_super_admin, validate_account_change
from app.core.deps import (
    get_current_user,
    is_admin_role,
    is_super_admin_role,
    require_admin,
    require_super_admin,
)
from app.core.security import create_access_token


def user(*, role: str, status: str = "active", auth_provider: str = "email"):
    return SimpleNamespace(
        id=uuid.uuid4(),
        role=role,
        status=status,
        auth_provider=auth_provider,
        auth_version=1,
    )


@pytest.fixture
def anyio_backend():
    return "asyncio"


class FakeResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class FakeDb:
    def __init__(self, value, scalar_value=None):
        self.value = value
        self.scalar_value = scalar_value

    async def execute(self, _query):
        return FakeResult(self.value)

    async def scalar(self, _query):
        return self.scalar_value


def test_admin_role_includes_admin_and_super_admin():
    assert is_admin_role("admin")
    assert is_admin_role("super_admin")
    assert not is_admin_role("learner")


def test_super_admin_role_is_strict():
    assert is_super_admin_role("super_admin")
    assert not is_super_admin_role("admin")


@pytest.mark.anyio
async def test_admin_dependency_allows_both_admin_roles():
    assert (await require_admin(user(role="admin"))).role == "admin"
    assert (await require_admin(user(role="super_admin"))).role == "super_admin"
    with pytest.raises(HTTPException, match="需要管理员权限"):
        await require_admin(user(role="learner"))


@pytest.mark.anyio
async def test_super_admin_dependency_rejects_regular_admin():
    assert (await require_super_admin(user(role="super_admin"))).role == "super_admin"
    with pytest.raises(HTTPException, match="需要超级管理员权限"):
        await require_super_admin(user(role="admin"))


@pytest.mark.anyio
async def test_disabled_account_is_rejected_even_with_valid_token():
    target = user(role="learner", status="disabled")
    token = create_access_token({"sub": str(target.id), "auth_version": 1})

    with pytest.raises(HTTPException, match="账号已被禁用"):
        await get_current_user(db=FakeDb(target), authorization=f"Bearer {token}")


@pytest.mark.anyio
async def test_old_token_is_rejected_after_auth_version_changes():
    target = user(role="learner")
    target.auth_version = 2
    token = create_access_token({"sub": str(target.id), "auth_version": 1})

    with pytest.raises(HTTPException, match="登录状态已失效"):
        await get_current_user(db=FakeDb(target), authorization=f"Bearer {token}")


def test_super_admin_cannot_disable_self():
    actor = user(role="super_admin")

    with pytest.raises(HTTPException, match="不能禁用当前账号"):
        validate_account_change(actor, actor, new_status="disabled")


def test_super_admin_cannot_demote_self():
    actor = user(role="super_admin")

    with pytest.raises(HTTPException, match="不能降低当前账号权限"):
        validate_account_change(actor, actor, new_role="admin")


def test_anonymous_user_password_cannot_be_reset():
    actor = user(role="super_admin")
    target = user(role="learner", auth_provider="anonymous")

    with pytest.raises(HTTPException, match="匿名账号不支持重置密码"):
        validate_account_change(actor, target, reset_password=True)


@pytest.mark.anyio
async def test_last_active_super_admin_cannot_be_removed():
    target = user(role="super_admin")

    with pytest.raises(HTTPException, match="必须保留至少一个启用的超级管理员"):
        await _ensure_not_last_super_admin(
            FakeDb(target, scalar_value=1),
            target,
            removes_access=True,
        )
