import uuid
from datetime import datetime, timezone

from app.api.v1.exercises import _public_exercise, exercise_content_hash
from app.models.models import Exercise
from app.schemas.schemas import GeneratedExerciseData
from pydantic import ValidationError
import pytest


def test_public_exercise_hides_hidden_test_data():
    exercise = Exercise(
        id=uuid.uuid4(),
        chapter_id=None,
        language="python",
        tags=[],
        title="Double",
        description="Read an integer.",
        starter_code="",
        test_cases=[
            {"input": "2\n", "expected": "4\n", "hidden": False},
            {"input": "999\n", "expected": "1998\n", "hidden": True},
        ],
        difficulty="easy",
        source_kbs=[],
        status="published",
        judge_mode="judge0",
        validation_status="verified",
        validated_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
        reference_solution="print(int(input()) * 2)",
    )

    payload = _public_exercise(exercise)

    assert payload["test_cases"] == [
        {"input": "2\n", "expected": "4\n", "hidden": False}
    ]
    assert "reference_solution" not in payload


def test_validation_hash_changes_when_executable_content_changes():
    exercise = Exercise(
        title="Double",
        description="Read an integer.",
        language="python",
        difficulty="easy",
        tags=[],
        starter_code="",
        reference_solution="print(int(input()) * 2)",
        test_cases=[{"input": "2\n", "expected": "4\n", "hidden": False}],
    )
    before = exercise_content_hash(exercise)
    exercise.test_cases = [{"input": "2\n", "expected": "5\n", "hidden": False}]

    assert exercise_content_hash(exercise) != before


def test_generated_exercise_requires_public_and_hidden_cases():
    with pytest.raises(ValidationError):
        GeneratedExerciseData(
            title="Bad",
            description="Missing hidden tests",
            language="python",
            difficulty="easy",
            reference_solution="print(1)",
            test_cases=[
                {"input": "", "expected": "1", "hidden": False},
                {"input": "", "expected": "1", "hidden": False},
            ],
        )
