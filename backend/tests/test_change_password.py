from types import SimpleNamespace
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.api.v1.auth import change_password
from app.core.security import hash_password, verify_password
from app.schemas.schemas import ChangePasswordRequest


@pytest.fixture
def anyio_backend():
    return "asyncio"


class FakeDb:
    def __init__(self):
        self.committed = False

    async def commit(self):
        self.committed = True

    async def refresh(self, user):
        return None


@pytest.mark.anyio
async def test_change_password_rejects_wrong_current_password():
    user = SimpleNamespace(
        hashed_password=hash_password("old-password"),
        auth_provider="email",
        auth_version=1,
        id="00000000-0000-0000-0000-000000000001",
        email="user@example.com",
        nickname="User",
        avatar_url=None,
        role="learner",
        status="active",
        preferences={},
        created_at=datetime.now(timezone.utc),
        updated_at=None,
    )

    with pytest.raises(HTTPException, match="当前密码错误"):
        await change_password(
            ChangePasswordRequest(
                current_password="wrong-password",
                new_password="new-password",
            ),
            FakeDb(),
            user,
        )


@pytest.mark.anyio
async def test_change_password_returns_new_token_and_revokes_old_tokens():
    user = SimpleNamespace(
        hashed_password=hash_password("old-password"),
        auth_provider="email",
        auth_version=2,
        id="00000000-0000-0000-0000-000000000001",
        email="user@example.com",
        nickname="User",
        avatar_url=None,
        role="learner",
        status="active",
        preferences={},
        created_at=datetime.now(timezone.utc),
        updated_at=None,
    )
    db = FakeDb()

    response = await change_password(
        ChangePasswordRequest(
            current_password="old-password",
            new_password="new-password",
        ),
        db,
        user,
    )

    assert db.committed is True
    assert user.auth_version == 3
    assert verify_password("new-password", user.hashed_password)
    assert response.access_token
