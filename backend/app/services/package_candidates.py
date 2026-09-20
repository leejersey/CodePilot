"""Aggregate and merge package candidates for paths and chapters."""

from __future__ import annotations

import re
from collections import defaultdict
from uuid import UUID

_PKG_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.+-]*$")

HARD_DENYLIST: frozenset[str] = frozenset()

KNOWN_SAFE_HINTS: frozenset[str] = frozenset(
    {
        "langchain",
        "langchain-core",
        "langchain-community",
        "langchain-openai",
        "langchain-text-splitters",
        "langchain-deepseek",
        "langsmith",
        "openai",
        "httpx",
        "requests",
        "pydantic",
        "fastapi",
        "uvicorn",
        "numpy",
        "pandas",
        "python-dotenv",
    }
)

Candidate = dict[str, str]


def sanitize_name(raw: str | None) -> str | None:
    name = (raw or "").strip().lower()
    for sep in ("==", ">=", "<="):
        name = name.split(sep)[0]
    name = name.strip()
    if not name or not _PKG_RE.match(name) or name in HARD_DENYLIST:
        return None
    return name


def _make_candidate(name: str, source: str) -> Candidate:
    return {"name": name, "status": "pending", "source": source}


def aggregate_candidates(
    chapter_to_refs: dict[UUID, list[tuple[str, str]]],
) -> tuple[list[Candidate], dict[UUID, list[Candidate]]]:
    """Split extracted refs into path defaults (≥2 chapters) and chapter extras."""
    chapter_ids = list(chapter_to_refs.keys())
    name_sources: dict[str, str] = {}
    chapters_by_name: dict[str, set[UUID]] = defaultdict(set)

    for chapter_id, refs in chapter_to_refs.items():
        seen_in_chapter: set[str] = set()
        for name, source in refs:
            if name in seen_in_chapter:
                continue
            seen_in_chapter.add(name)
            chapters_by_name[name].add(chapter_id)
            if name not in name_sources:
                name_sources[name] = source

    single_chapter = len(chapter_ids) == 1
    path_names: set[str] = set()
    chapter_extras: dict[UUID, list[Candidate]] = {cid: [] for cid in chapter_ids}

    for name, chapter_set in chapters_by_name.items():
        if single_chapter or len(chapter_set) >= 2:
            path_names.add(name)
        else:
            (only_chapter,) = chapter_set
            chapter_extras[only_chapter].append(
                _make_candidate(name, name_sources[name])
            )

    path_candidates = [
        _make_candidate(name, name_sources[name]) for name in sorted(path_names)
    ]
    return path_candidates, chapter_extras


def merge_status(old: list[Candidate], new: list[Candidate]) -> list[Candidate]:
    """Keep prior status for names still present; drop names absent from new."""
    old_status = {item["name"]: item["status"] for item in old}
    merged: list[Candidate] = []
    for item in new:
        name = item["name"]
        status = old_status.get(name, item.get("status", "pending"))
        merged.append({**item, "status": status})
    return merged


def approved_names(candidates: list[Candidate]) -> list[str]:
    return [c["name"] for c in candidates if c.get("status") == "approved"]


def effective_packages(path_c: list[Candidate], chapter_c: list[Candidate]) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for item in path_c + chapter_c:
        if item.get("status") != "approved":
            continue
        name = item["name"]
        if name in seen:
            continue
        seen.add(name)
        names.append(name)
    return names


def package_status_lookup(
    path_c: list[Candidate], chapter_c: list[Candidate]
) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for item in path_c:
        lookup[item["name"]] = item["status"]
    for item in chapter_c:
        lookup[item["name"]] = item["status"]
    return lookup
