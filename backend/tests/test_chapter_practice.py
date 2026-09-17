import uuid
from types import SimpleNamespace

from app.api.v1.exercises import build_chapter_practice_items


def exercise():
    return SimpleNamespace(id=uuid.uuid4())


def submission(exercise_id, *, result, score, trusted=True):
    return SimpleNamespace(
        exercise_id=exercise_id,
        result=result,
        score=score,
        trusted=trusted,
    )


def test_chapter_practice_marks_only_trusted_pass_as_completed():
    first = exercise()
    second = exercise()
    items = build_chapter_practice_items(
        [first, second],
        [
            submission(first.id, result="fail", score=40),
            submission(first.id, result="pass", score=95, trusted=False),
            submission(second.id, result="pass", score=100),
        ],
    )

    assert items[first.id] == {
        "attempted": True,
        "passed": False,
        "best_score": 95,
    }
    assert items[second.id] == {
        "attempted": True,
        "passed": True,
        "best_score": 100,
    }


def test_chapter_practice_marks_exercise_without_submission_as_unattempted():
    target = exercise()

    items = build_chapter_practice_items([target], [])

    assert items[target.id] == {
        "attempted": False,
        "passed": False,
        "best_score": None,
    }
