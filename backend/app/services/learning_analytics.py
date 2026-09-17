"""Pure calculation rules for effective learning time and knowledge mastery."""

from collections import defaultdict
from datetime import datetime
from typing import Any


def countable_heartbeat_seconds(
    previous: datetime,
    current: datetime,
    *,
    active: bool,
    stale_after_seconds: int = 90,
    max_interval_seconds: int = 45,
) -> int:
    if not active:
        return 0
    elapsed = max(0, int((current - previous).total_seconds()))
    if elapsed > stale_after_seconds:
        return 0
    return min(elapsed, max_interval_seconds)


def calculate_knowledge_mastery(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    exercises: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not row.get("trusted"):
            continue
        exercise_id = str(row.get("exercise_id") or "")
        tags = [str(tag).strip() for tag in (row.get("tags") or []) if str(tag).strip()]
        if not exercise_id or not tags:
            continue
        item = exercises.setdefault(
            exercise_id,
            {"tags": tags, "attempts": 0, "best_score": 0},
        )
        item["attempts"] += 1
        item["best_score"] = max(item["best_score"], int(row.get("score") or 0))

    topics: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"scores": [], "attempts": 0, "exercises": 0}
    )
    for item in exercises.values():
        penalty = min(max(item["attempts"] - 1, 0) * 5, 20)
        effective_score = max(0, item["best_score"] - penalty)
        for tag in item["tags"]:
            topics[tag]["scores"].append(effective_score)
            topics[tag]["attempts"] += item["attempts"]
            topics[tag]["exercises"] += 1

    result = []
    for topic, item in topics.items():
        mastery = round(sum(item["scores"]) / len(item["scores"]))
        result.append({
            "topic": topic,
            "mastery": mastery,
            "attempts": item["attempts"],
            "exercises": item["exercises"],
            "weak": mastery < 60,
        })
    return sorted(result, key=lambda item: (not item["weak"], item["mastery"], item["topic"]))
