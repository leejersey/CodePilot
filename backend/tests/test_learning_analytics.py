from datetime import datetime, timedelta, timezone

from app.services.learning_analytics import (
    calculate_knowledge_mastery,
    countable_heartbeat_seconds,
)


def test_heartbeat_counts_only_recent_active_interval():
    previous = datetime(2026, 9, 16, 10, 0, tzinfo=timezone.utc)

    assert countable_heartbeat_seconds(
        previous, previous + timedelta(seconds=30), active=True
    ) == 30
    assert countable_heartbeat_seconds(
        previous, previous + timedelta(minutes=3), active=True
    ) == 0
    assert countable_heartbeat_seconds(
        previous, previous + timedelta(seconds=30), active=False
    ) == 0


def test_heartbeat_caps_single_interval():
    previous = datetime(2026, 9, 16, 10, 0, tzinfo=timezone.utc)

    assert countable_heartbeat_seconds(
        previous, previous + timedelta(seconds=70), active=True
    ) == 45


def test_mastery_uses_trusted_results_and_penalizes_repeated_attempts():
    rows = [
        {"tags": ["异步", "网络"], "score": 100, "trusted": True, "exercise_id": "a"},
        {"tags": ["异步"], "score": 40, "trusted": True, "exercise_id": "a"},
        {"tags": ["异步"], "score": 100, "trusted": False, "exercise_id": "b"},
        {"tags": ["网络"], "score": 50, "trusted": True, "exercise_id": "c"},
    ]

    result = calculate_knowledge_mastery(rows)

    assert result[0]["topic"] == "网络"
    assert result[0]["mastery"] == 72
    assert result[0]["weak"] is False
    assert result[1]["topic"] == "异步"
    assert result[1]["mastery"] == 95
    assert result[1]["attempts"] == 2


def test_mastery_marks_topics_below_sixty_as_weak():
    result = calculate_knowledge_mastery([
        {"tags": ["递归"], "score": 45, "trusted": True, "exercise_id": "a"},
    ])

    assert result == [{
        "topic": "递归",
        "mastery": 45,
        "attempts": 1,
        "exercises": 1,
        "weak": True,
    }]
