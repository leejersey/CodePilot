"""Modal run-modal uses course effective package set (no live Modal)."""

import logging
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.services.modal_sandbox import ModalRunResult
from app.services.package_candidates import KNOWN_SAFE_HINTS, resolve_modal_install


@pytest.fixture
def anyio_backend():
    return "asyncio"


def test_to_install_intersection():
    install, blocked = resolve_modal_install(
        code="import httpx\nimport numpy\n",
        effective=["httpx"],
        statuses={"numpy": "pending"},
    )
    assert install == ["httpx"]
    assert blocked[0][0] == "numpy"
    assert blocked[0][1] == "pending"


def test_legacy_fallback_when_candidates_empty(caplog):
    with caplog.at_level(logging.WARNING):
        install, blocked = resolve_modal_install(
            code="import httpx\nimport custom_sdk\n",
            path_candidates=[],
            chapter_candidates=[],
        )
    assert install == ["httpx"]
    assert "httpx" in KNOWN_SAFE_HINTS
    assert blocked[0][0] == "custom-sdk"
    assert blocked[0][1] == "absent"
    assert any("legacy" in r.message.lower() or "fallback" in r.message.lower() for r in caplog.records)


def test_resolve_modal_install_caps_at_eight():
    names = [
        "langchain",
        "langchain-core",
        "openai",
        "httpx",
        "requests",
        "pydantic",
        "fastapi",
        "uvicorn",
        "numpy",
    ]
    code = "\n".join(f"import {n.replace('-', '_')}" for n in names)
    with pytest.raises(ValueError, match="最多安装"):
        resolve_modal_install(code=code, effective=names)


def test_modal_run_request_requires_path_and_chapter():
    from app.api.v1.code import ModalRunRequest

    with pytest.raises(ValidationError):
        ModalRunRequest(code="print(1)")


def test_modal_run_request_ignores_client_packages():
    from app.api.v1.code import ModalRunRequest

    body = ModalRunRequest(
        code="import httpx\n",
        path_id=uuid.uuid4(),
        chapter_id=uuid.uuid4(),
        packages=["evil-pkg"],  # type: ignore[call-arg]
    )
    assert not hasattr(body, "packages") or getattr(body, "packages", None) in (None, [])


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


def _actor():
    return SimpleNamespace(id=uuid.uuid4(), role="learner", status="active")


@pytest.mark.anyio
async def test_run_modal_422_when_detected_not_in_effective(monkeypatch):
    from app.api.v1 import code as code_api

    path_id = uuid.uuid4()
    chapter_id = uuid.uuid4()
    chapter = SimpleNamespace(
        id=chapter_id,
        path_id=path_id,
        package_candidates=[{"name": "httpx", "status": "pending", "source": "import"}],
    )
    path = SimpleNamespace(
        id=path_id,
        package_candidates=[{"name": "langchain", "status": "approved", "source": "import"}],
    )
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

    body = code_api.ModalRunRequest(
        code="import httpx\n",
        path_id=path_id,
        chapter_id=chapter_id,
    )
    with pytest.raises(HTTPException) as err:
        await code_api.run_code_modal(body, user=_actor(), db=db)

    assert err.value.status_code == 422
    detail = str(err.value.detail)
    assert "httpx" in detail
    assert "pending" in detail
    run_mock.assert_not_awaited()


@pytest.mark.anyio
async def test_run_modal_installs_intersection_only(monkeypatch):
    from app.api.v1 import code as code_api

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
            {"name": "numpy", "status": "approved", "source": "import"},
        ],
    )
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

    body = code_api.ModalRunRequest(
        code="import httpx\n",
        path_id=path_id,
        chapter_id=chapter_id,
        dotenv="",
    )
    result = await code_api.run_code_modal(body, user=_actor(), db=db)

    assert result.judge_source == "modal"
    assert result.has_error is False
    run_mock.assert_awaited_once()
    call_args = run_mock.await_args
    assert call_args.args[1] == ["httpx"] or call_args.kwargs.get("packages") == ["httpx"]


@pytest.mark.anyio
async def test_run_modal_404_when_chapter_path_mismatch(monkeypatch):
    from app.api.v1 import code as code_api

    path_id = uuid.uuid4()
    chapter = SimpleNamespace(
        id=uuid.uuid4(),
        path_id=uuid.uuid4(),
        package_candidates=[],
    )
    path = SimpleNamespace(id=path_id, package_candidates=[])
    db = _RunModalDb(chapter=chapter, path=path)

    monkeypatch.setattr(
        code_api,
        "can_access_legacy_path",
        AsyncMock(return_value=True),
        raising=False,
    )
    body = code_api.ModalRunRequest(
        code="print(1)",
        path_id=path_id,
        chapter_id=chapter.id,
    )
    with pytest.raises(HTTPException) as err:
        await code_api.run_code_modal(body, user=_actor(), db=db)
    assert err.value.status_code == 404
