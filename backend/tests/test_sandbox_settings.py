"""Sandbox settings stored on user.preferences['sandbox']."""

import uuid
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.api.v1 import settings as settings_api


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture(autouse=True)
def _noop_flag_modified(monkeypatch):
    """SimpleNamespace is not a SQLAlchemy mapped instance."""
    monkeypatch.setattr(settings_api, "flag_modified", lambda *_a, **_k: None)


def user_with_prefs(prefs=None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        role="learner",
        status="active",
        preferences=prefs if prefs is not None else {},
    )


class FakeDb:
    def __init__(self):
        self.committed = False

    async def commit(self):
        self.committed = True

    async def refresh(self, _obj):
        return None


@pytest.mark.anyio
async def test_get_empty_prefs_has_no_credentials():
    user = user_with_prefs()
    out = await settings_api.get_sandbox_settings(user=user)
    assert out.default_provider is None
    assert out.has_modal_credentials is False
    assert out.modal_token_id_masked is None


@pytest.mark.anyio
async def test_put_then_get_masks_secret():
    user = user_with_prefs()
    db = FakeDb()
    body = settings_api.SandboxSettingsUpdate(
        default_provider="modal",
        modal_token_id="ak-test",
        modal_token_secret="sk-secret",
        keep_modal_secret=False,
    )
    await settings_api.put_sandbox_settings(body, db=db, user=user)
    assert db.committed is True
    out = await settings_api.get_sandbox_settings(user=user)
    assert out.has_modal_credentials is True
    assert out.default_provider == "modal"
    assert out.modal_token_id_masked
    assert out.modal_token_id_masked != "ak-test"
    assert "sk-secret" not in str(out.model_dump())
    stored = user.preferences["sandbox"]["modal"]
    assert stored["token_id"] == "ak-test"
    assert stored["token_secret"] == "sk-secret"


@pytest.mark.anyio
async def test_put_keeps_secret_when_keep_modal_secret():
    user = user_with_prefs(
        {
            "sandbox": {
                "default_provider": "modal",
                "modal": {"token_id": "ak-old", "token_secret": "sk-old"},
            }
        }
    )
    db = FakeDb()
    body = settings_api.SandboxSettingsUpdate(
        modal_token_id="ak-new",
        keep_modal_secret=True,
    )
    await settings_api.put_sandbox_settings(body, db=db, user=user)
    stored = user.preferences["sandbox"]["modal"]
    assert stored["token_id"] == "ak-new"
    assert stored["token_secret"] == "sk-old"


def test_put_rejects_daytona_default_phase_a():
    with pytest.raises(ValidationError):
        settings_api.SandboxSettingsUpdate(default_provider="daytona")  # type: ignore[arg-type]
