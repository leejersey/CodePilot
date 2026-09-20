"""Modal run-modal requires learner BYOK credentials (handler-level)."""

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.services.modal_sandbox import ModalRunResult


@pytest.fixture
def anyio_backend():
    return "asyncio"


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _RunModalDb:
    def __init__(self, *, chapter=None, path=None):
        self.chapter = chapter
        self.path = path

    async def execute(self, query):
        text = str(query)
        if "chapters" in text.lower() or "Chapter" in text:
            return _ScalarResult(self.chapter)
        return _ScalarResult(self.path)

    async def get(self, model, ident):
        name = getattr(model, "__name__", str(model))
        if "Chapter" in name:
            return self.chapter if self.chapter and self.chapter.id == ident else None
        if "LearningPath" in name or "Path" in name:
            return self.path if self.path and self.path.id == ident else None
        return None

    async def scalar(self, query):
        result = await self.execute(query)
        return result.scalar_one_or_none()


def _path_chapter():
    path_id = uuid.uuid4()
    chapter_id = uuid.uuid4()
    chapter = SimpleNamespace(
        id=chapter_id,
        path_id=path_id,
        package_candidates=[],
    )
    path = SimpleNamespace(
        id=path_id,
        package_candidates=[
            {"name": "httpx", "status": "approved", "source": "import"},
        ],
    )
    return path_id, chapter_id, chapter, path


@pytest.mark.anyio
async def test_run_modal_422_without_sandbox_prefs(monkeypatch):
    from app.api.v1 import code as code_api

    path_id, chapter_id, chapter, path = _path_chapter()
    db = _RunModalDb(chapter=chapter, path=path)

    monkeypatch.setattr(
        code_api,
        "can_access_legacy_path",
        AsyncMock(return_value=True),
        raising=False,
    )
    run_mock = AsyncMock(
        return_value=ModalRunResult(stdout="ok", stderr="", exit_code=0, status="Finished")
    )
    monkeypatch.setattr(code_api, "run_python_in_modal", run_mock)

    user = SimpleNamespace(
        id=uuid.uuid4(),
        role="learner",
        status="active",
        preferences=None,
    )
    body = code_api.ModalRunRequest(
        code="import httpx\n",
        path_id=path_id,
        chapter_id=chapter_id,
    )
    with pytest.raises(HTTPException) as err:
        await code_api.run_code_modal(body, user=user, db=db)

    assert err.value.status_code == 422
    detail = str(err.value.detail)
    assert "个人中心" in detail
    run_mock.assert_not_awaited()


@pytest.mark.anyio
async def test_run_modal_passes_learner_tokens(monkeypatch):
    from app.api.v1 import code as code_api

    path_id, chapter_id, chapter, path = _path_chapter()
    db = _RunModalDb(chapter=chapter, path=path)

    monkeypatch.setattr(
        code_api,
        "can_access_legacy_path",
        AsyncMock(return_value=True),
        raising=False,
    )
    run_mock = AsyncMock(
        return_value=ModalRunResult(stdout="ok", stderr="", exit_code=0, status="Finished")
    )
    monkeypatch.setattr(code_api, "run_python_in_modal", run_mock)

    user = SimpleNamespace(
        id=uuid.uuid4(),
        role="learner",
        status="active",
        preferences={
            "sandbox": {
                "modal": {
                    "token_id": "ak-learner",
                    "token_secret": "as-learner-secret",
                }
            }
        },
    )
    body = code_api.ModalRunRequest(
        code="import httpx\n",
        path_id=path_id,
        chapter_id=chapter_id,
        dotenv="",
    )
    result = await code_api.run_code_modal(body, user=user, db=db)

    assert result.judge_source == "modal"
    run_mock.assert_awaited_once()
    kwargs = run_mock.await_args.kwargs
    assert kwargs["token_id"] == "ak-learner"
    assert kwargs["token_secret"] == "as-learner-secret"


@pytest.mark.anyio
async def test_run_modal_daytona_prefs_calls_daytona_runner(monkeypatch):
    from app.api.v1 import code as code_api

    path_id, chapter_id, chapter, path = _path_chapter()
    db = _RunModalDb(chapter=chapter, path=path)

    monkeypatch.setattr(
        code_api,
        "can_access_legacy_path",
        AsyncMock(return_value=True),
        raising=False,
    )
    modal_mock = AsyncMock(
        return_value=ModalRunResult(stdout="modal", stderr="", exit_code=0, status="Finished")
    )
    daytona_mock = AsyncMock(
        return_value=ModalRunResult(stdout="daytona-ok", stderr="", exit_code=0, status="Finished")
    )
    monkeypatch.setattr(code_api, "run_python_in_modal", modal_mock)
    monkeypatch.setattr(code_api, "run_python_in_daytona", daytona_mock)

    user = SimpleNamespace(
        id=uuid.uuid4(),
        role="learner",
        status="active",
        preferences={
            "sandbox": {
                "default_provider": "daytona",
                "daytona": {"api_key": "dtn_learner"},
            }
        },
    )
    body = code_api.ModalRunRequest(
        code="import httpx\n",
        path_id=path_id,
        chapter_id=chapter_id,
        dotenv="",
    )
    result = await code_api.run_code_modal(body, user=user, db=db)

    assert result.judge_source == "daytona"
    assert result.output == "daytona-ok"
    daytona_mock.assert_awaited_once()
    kwargs = daytona_mock.await_args.kwargs
    assert kwargs["api_key"] == "dtn_learner"
    modal_mock.assert_not_awaited()
