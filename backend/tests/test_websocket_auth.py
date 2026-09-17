import uuid
from types import SimpleNamespace

import pytest

from app.core.security import create_access_token
from app.services.ws_auth import (
    WebSocketAuthError,
    authenticate_websocket,
    extract_websocket_token,
)


@pytest.fixture
def anyio_backend():
    return "asyncio"


class FakeResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value

    def first(self):
        return self.value


class FakeDb:
    def __init__(self, *values):
        self.values = iter(values)

    async def execute(self, _query):
        return FakeResult(next(self.values))


def user(*, status="active", auth_version=1, role="learner"):
    return SimpleNamespace(
        id=uuid.uuid4(),
        status=status,
        auth_version=auth_version,
        role=role,
        auth_provider="email",
    )


def test_websocket_auth_frame_requires_auth_type_and_token():
    with pytest.raises(WebSocketAuthError) as exc:
        extract_websocket_token({"type": "message", "content": "hello"})

    assert exc.value.close_code == 4401


def test_websocket_auth_frame_returns_token():
    assert extract_websocket_token({"type": "auth", "token": "jwt"}) == "jwt"


@pytest.mark.anyio
async def test_websocket_rejects_invalid_token_before_database_access():
    db = FakeDb()

    with pytest.raises(WebSocketAuthError) as exc:
        await authenticate_websocket(db, uuid.uuid4(), "invalid-token")

    assert exc.value.close_code == 4401


@pytest.mark.anyio
async def test_websocket_rejects_disabled_account():
    target = user(status="disabled")
    token = create_access_token({"sub": str(target.id), "auth_version": 1})

    with pytest.raises(WebSocketAuthError) as exc:
        await authenticate_websocket(FakeDb(target), uuid.uuid4(), token)

    assert exc.value.close_code == 4403


@pytest.mark.anyio
async def test_websocket_rejects_token_after_auth_version_changes():
    target = user(auth_version=2)
    token = create_access_token({"sub": str(target.id), "auth_version": 1})

    with pytest.raises(WebSocketAuthError) as exc:
        await authenticate_websocket(FakeDb(target), uuid.uuid4(), token)

    assert exc.value.close_code == 4401


@pytest.mark.anyio
async def test_websocket_rejects_conversation_owned_by_another_user():
    target = user()
    conversation = SimpleNamespace(id=uuid.uuid4(), user_id=uuid.uuid4())
    token = create_access_token({"sub": str(target.id), "auth_version": 1})

    with pytest.raises(WebSocketAuthError) as exc:
        await authenticate_websocket(
            FakeDb(target, conversation), conversation.id, token
        )

    assert exc.value.close_code == 4403


@pytest.mark.anyio
async def test_websocket_returns_authenticated_owner_and_conversation():
    target = user()
    conversation = SimpleNamespace(id=uuid.uuid4(), user_id=target.id)
    token = create_access_token({"sub": str(target.id), "auth_version": 1})

    authenticated_user, authenticated_conversation = await authenticate_websocket(
        FakeDb(target, conversation), conversation.id, token
    )

    assert authenticated_user is target
    assert authenticated_conversation is conversation


@pytest.mark.anyio
async def test_websocket_accepts_server_signed_anonymous_token_for_owner():
    target = user()
    target.auth_provider = "anonymous"
    conversation = SimpleNamespace(id=uuid.uuid4(), user_id=target.id)
    token = create_access_token(
        {
            "sub": str(target.id),
            "auth_version": 1,
            "token_kind": "anonymous",
        },
        expires_hours=1,
    )

    authenticated_user, authenticated_conversation = await authenticate_websocket(
        FakeDb(target, conversation), conversation.id, token
    )

    assert authenticated_user is target
    assert authenticated_conversation is conversation


@pytest.mark.anyio
async def test_websocket_rejects_unenrolled_user_for_mapped_chapter():
    target = user()
    conversation = SimpleNamespace(
        id=uuid.uuid4(),
        user_id=target.id,
        chapter_id=uuid.uuid4(),
    )
    mapped_course = SimpleNamespace(
        id=uuid.uuid4(),
        author_id=uuid.uuid4(),
        status="published",
        visibility="published",
    )
    token = create_access_token({"sub": str(target.id), "auth_version": 1})

    with pytest.raises(WebSocketAuthError) as exc:
        await authenticate_websocket(
            FakeDb(target, conversation, (mapped_course, None)),
            conversation.id,
            token,
        )

    assert exc.value.close_code == 4403
