import uuid
from types import SimpleNamespace

import pytest

from app.api.v1 import paths
from app.schemas.schemas import PathGenerateRequest
from app.services.background_jobs import FUNCTION_BY_TYPE


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_generate_path_enqueues_background_job(monkeypatch):
    queued_job = SimpleNamespace(id=uuid.uuid4(), job_type="path_generate")
    captured = {}

    async def fake_enqueue(db, *, user, job_type, payload):
        captured.update(job_type=job_type, payload=payload, user=user)
        return queued_job

    monkeypatch.setattr(paths, "create_and_enqueue_job", fake_enqueue, raising=False)
    user = SimpleNamespace(id=uuid.uuid4())
    request = PathGenerateRequest(
        topic="Python 异步编程",
        difficulty="intermediate",
        user_background="初学者",
    )

    result = await paths.generate_path(request, db=object(), user=user)

    assert result is queued_job
    assert captured["job_type"] == "path_generate"
    assert captured["payload"]["topic"] == "Python 异步编程"


def test_path_generation_job_is_recoverable():
    assert FUNCTION_BY_TYPE["path_generate"] == "generate_path_job"
