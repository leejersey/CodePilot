import pytest

from app.services.judge0 import (
    Judge0CircuitBreaker,
    JudgeResult,
    build_auth_headers,
    evaluate_test_results,
    language_id_for,
    normalize_output,
)


def test_language_aliases_map_to_supported_judge0_ids():
    assert language_id_for("python") == 71
    assert language_id_for("javascript") == 63
    assert language_id_for("cpp") == 54


def test_output_comparison_ignores_line_endings_and_trailing_space():
    assert normalize_output("a  \r\nb\n") == "a\nb"


def test_test_evaluation_uses_runtime_results_not_llm_opinion():
    cases = [
        {"input": "1\n", "expected": "2\n", "hidden": False},
        {"input": "2\n", "expected": "4\n", "hidden": True},
    ]
    runs = [
        JudgeResult(status_id=3, status="Accepted", stdout="2\n"),
        JudgeResult(status_id=3, status="Accepted", stdout="5\n"),
    ]

    result = evaluate_test_results(cases, runs)

    assert result["result"] == "fail"
    assert result["score"] == 50
    assert result["test_results"][0]["passed"] is True
    assert result["test_results"][1] == {
        "case": 2,
        "passed": False,
        "hidden": True,
        "status": "Wrong Answer",
        "time": None,
        "memory": None,
    }


def test_compile_error_fails_test_with_real_status():
    result = evaluate_test_results(
        [{"input": "", "expected": "", "hidden": False}],
        [JudgeResult(status_id=6, status="Compilation Error", compile_output="bad syntax")],
    )

    assert result["result"] == "error"
    assert result["test_results"][0]["status"] == "Compilation Error"


def test_remote_auth_headers_support_standard_and_rapidapi():
    assert build_auth_headers("X-Auth-Token", "secret", "") == {
        "X-Auth-Token": "secret"
    }
    assert build_auth_headers("", "rapid-key", "judge0.p.rapidapi.com") == {
        "X-RapidAPI-Key": "rapid-key",
        "X-RapidAPI-Host": "judge0.p.rapidapi.com",
    }


def test_circuit_breaker_opens_temporarily_after_failures():
    now = [100.0]
    breaker = Judge0CircuitBreaker(failure_threshold=2, cooldown_seconds=30, clock=lambda: now[0])

    breaker.record_failure()
    assert breaker.allow_request() is True
    breaker.record_failure()
    assert breaker.allow_request() is False

    now[0] = 131.0
    assert breaker.allow_request() is True
