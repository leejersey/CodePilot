import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

from app.api.v1.exercises import submission_response


def test_submission_history_contains_code_time_and_public_test_details():
    created_at = datetime.now(timezone.utc)
    submission = SimpleNamespace(
        id=uuid.uuid4(),
        submitted_code="print(input())",
        result="fail",
        score=50,
        ai_feedback="输出不匹配",
        test_results=[
            {
                "case": 1,
                "hidden": False,
                "passed": False,
                "input": "1",
                "expected": "2",
                "actual": "1",
            }
        ],
        execution_time="0.01",
        memory=1024,
        judge_source="judge0",
        trusted=True,
        created_at=created_at,
    )

    response = submission_response(submission)

    assert response.submitted_code == "print(input())"
    assert response.created_at == created_at
    assert response.test_results[0]["expected"] == "2"
    assert response.test_results[0]["actual"] == "1"


def test_submission_history_never_exposes_hidden_test_values():
    submission = SimpleNamespace(
        id=uuid.uuid4(),
        submitted_code="pass",
        result="fail",
        score=0,
        ai_feedback=None,
        test_results=[
            {
                "case": 1,
                "hidden": True,
                "passed": False,
                "input": "secret input",
                "expected": "secret answer",
                "actual": "leaked output",
                "stderr": "secret error",
            }
        ],
        execution_time=None,
        memory=None,
        judge_source="llm",
        trusted=False,
        created_at=datetime.now(timezone.utc),
    )

    result = submission_response(submission).test_results[0]

    assert result == {
        "case": 1,
        "hidden": True,
        "passed": False,
    }
