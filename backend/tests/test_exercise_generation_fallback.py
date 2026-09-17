from types import SimpleNamespace

import pytest

from app.api.v1 import exercises


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_generated_exercise_stays_unverified_after_llm_fallback(monkeypatch):
    exercise = SimpleNamespace(
        description="两数之和",
        test_cases=[{"input": "1 2", "expected": "3", "hidden": False}],
        reference_solution="print(sum(map(int, input().split())))",
        language="python",
        validation_status="unverified",
        validation_hash=None,
        validated_at=None,
    )

    async def fallback(*_args, **_kwargs):
        return {
            "result": "pass",
            "trusted": False,
            "judge_source": "llm",
        }

    monkeypatch.setattr(exercises, "judge_submission", fallback)

    result = await exercises.validate_generated_exercise(exercise)

    assert result["judge_source"] == "llm"
    assert exercise.validation_status == "unverified"
    assert exercise.validation_hash is None
