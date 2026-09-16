import pytest

import app.services.exercise as exercise_service
from app.services.judge0 import JudgeUnavailable


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_real_judge_result_is_marked_trusted(monkeypatch):
    async def real_result(*args, **kwargs):
        return {"result": "pass", "score": 100, "test_results": []}

    async def feedback(*args, **kwargs):
        return {"ai_feedback": "很好"}

    monkeypatch.setattr(exercise_service, "run_test_cases", real_result)
    monkeypatch.setattr(exercise_service, "call_llm_json", feedback)

    result = await exercise_service.judge_submission("题目", [], "print(1)")

    assert result["trusted"] is True
    assert result["judge_source"] == "judge0"


@pytest.mark.anyio
async def test_remote_failure_uses_untrusted_llm_fallback_without_hidden_data(monkeypatch):
    async def unavailable(*args, **kwargs):
        raise JudgeUnavailable("remote unavailable")

    async def llm_result(*args, **kwargs):
        return {
            "result": "pass",
            "score": 100,
            "test_results": [{"case": 1, "passed": True}],
            "ai_feedback": "临时评估",
        }

    monkeypatch.setattr(exercise_service, "run_test_cases", unavailable)
    monkeypatch.setattr(exercise_service, "call_llm_json", llm_result)
    cases = [{"input": "secret", "expected": "secret", "hidden": True}]

    result = await exercise_service.judge_submission("题目", cases, "print(1)")

    assert result["trusted"] is False
    assert result["judge_source"] == "llm"
    assert result["test_results"] == [{
        "case": 1,
        "passed": True,
        "hidden": True,
        "status": "LLM 临时评估",
    }]
    assert "secret" not in str(result["test_results"])
