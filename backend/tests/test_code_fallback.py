from types import SimpleNamespace

import pytest

import app.api.v1.code as code_api
from app.services.judge0 import JudgeUnavailable


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_code_run_uses_untrusted_llm_when_remote_judge_is_down(monkeypatch):
    async def unavailable(*args, **kwargs):
        raise JudgeUnavailable("down")

    async def simulated(*args, **kwargs):
        return {
            "output": "42",
            "has_error": False,
            "status": "LLM 临时模拟",
        }

    monkeypatch.setattr(code_api, "judge0_run_code", unavailable)
    monkeypatch.setattr(code_api, "call_llm_json", simulated, raising=False)

    response = await code_api.run_code(
        code_api.CodeRunRequest(code="print(6 * 7)", language="python"),
        SimpleNamespace(id="user"),
    )

    assert response.output == "42"
    assert response.trusted is False
    assert response.judge_source == "llm"
