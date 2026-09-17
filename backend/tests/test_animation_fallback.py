import asyncio

from app.api.v1 import animation
from app.services.judge0 import JudgeUnavailable


def test_snippet_run_falls_back_to_llm_when_judge0_is_unavailable(monkeypatch):
    async def unavailable(*_args, **_kwargs):
        raise JudgeUnavailable("circuit open")

    async def simulated(*_args, **_kwargs):
        return {
            "output": "3",
            "has_error": False,
            "status": "LLM 临时模拟",
        }

    monkeypatch.setattr(animation, "run_code", unavailable)
    monkeypatch.setattr(animation, "call_llm_json", simulated)

    output, has_error, trusted, source = asyncio.run(
        animation._run_snippet("print(1 + 2)", "python")
    )

    assert output == "3"
    assert has_error is False
    assert trusted is False
    assert source == "llm"
