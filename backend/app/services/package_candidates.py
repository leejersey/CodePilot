"""Aggregate and merge package candidates for paths and chapters."""

from __future__ import annotations

import json
import logging
import re
from collections import defaultdict
from collections.abc import Mapping, Sequence
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select

from app.services.package_extract import extract_package_refs

logger = logging.getLogger(__name__)

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

Candidate = dict[str, Any]


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
    """Keep prior status (and reason) for names still present; drop missing names."""
    old_by_name = {item["name"]: item for item in old}
    merged: list[Candidate] = []
    for item in new:
        name = item["name"]
        prev = old_by_name.get(name)
        if prev is None:
            merged.append(dict(item))
            continue
        out = {**item, "status": prev.get("status", item.get("status", "pending"))}
        if "reason" in prev:
            out["reason"] = prev["reason"]
        merged.append(out)
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


def resolve_modal_install(
    code: str,
    effective: Sequence[str] | None = None,
    statuses: Mapping[str, str] | None = None,
    *,
    path_candidates: Sequence[Candidate] | None = None,
    chapter_candidates: Sequence[Candidate] | None = None,
) -> tuple[list[str], list[tuple[str, str]]]:
    """Compute install list and blocked packages for a Modal course run.

    Returns ``(to_install, blocked)`` where ``blocked`` is
    ``[(name, status), ...]`` for detected packages not in the effective set.

    When both ``path_candidates`` and ``chapter_candidates`` are explicitly empty
    lists, uses temporary legacy fallback: ``KNOWN_SAFE_HINTS`` as the allow set.
    """
    status_map: dict[str, str] = dict(statuses or {})
    effective_list: list[str]

    if path_candidates is not None and chapter_candidates is not None:
        path_c = list(path_candidates)
        chapter_c = list(chapter_candidates)
        if not path_c and not chapter_c:
            logger.warning(
                "Modal package allow-list legacy fallback: path and chapter "
                "package_candidates are both empty; using KNOWN_SAFE_HINTS"
            )
            effective_list = sorted(KNOWN_SAFE_HINTS)
            status_map = {}
        else:
            effective_list = effective_packages(path_c, chapter_c)
            status_map = package_status_lookup(path_c, chapter_c)
    else:
        effective_list = list(effective or [])

    effective_set = set()
    for raw in effective_list:
        name = sanitize_name(raw)
        if name:
            effective_set.add(name)

    detected: list[str] = []
    seen: set[str] = set()
    for ref in extract_package_refs(code or ""):
        name = sanitize_name(ref.name)
        if not name or name in seen:
            continue
        seen.add(name)
        detected.append(name)

    install: list[str] = []
    blocked: list[tuple[str, str]] = []
    for name in detected:
        if name in effective_set:
            install.append(name)
        else:
            blocked.append((name, status_map.get(name, "absent")))

    if len(install) > 8:
        raise ValueError("一次最多安装 8 个白名单依赖")

    return install, blocked


def _stringify_field(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(value)


def collect_chapter_scan_text(
    *,
    outline_chapter: Mapping[str, Any] | None = None,
    skills: Sequence[Any] = (),
    exercises: Sequence[Any] = (),
) -> str:
    """Build Phase 1 scan text: outline entry, skill fields, exercise fields."""
    parts: list[str] = []
    if outline_chapter:
        parts.append(_stringify_field(dict(outline_chapter)))
    for skill in skills:
        if isinstance(skill, Mapping):
            teach = skill.get("teach_prompt")
            goal = skill.get("goal")
            objectives = skill.get("objectives")
        else:
            teach = getattr(skill, "teach_prompt", None)
            goal = getattr(skill, "goal", None)
            objectives = getattr(skill, "objectives", None)
        for value in (teach, goal, objectives):
            text = _stringify_field(value)
            if text:
                parts.append(text)
    for exercise in exercises:
        if isinstance(exercise, Mapping):
            starter = exercise.get("starter_code")
            description = exercise.get("description")
            title = exercise.get("title")
        else:
            starter = getattr(exercise, "starter_code", None)
            description = getattr(exercise, "description", None)
            title = getattr(exercise, "title", None)
        for value in (starter, description, title):
            text = _stringify_field(value)
            if text:
                parts.append(text)
    return "\n".join(parts)


def build_chapter_refs_from_texts(
    chapter_texts: dict[UUID, str],
) -> dict[UUID, list[tuple[str, str]]]:
    """Run extract_package_refs on each chapter's collected text."""
    result: dict[UUID, list[tuple[str, str]]] = {}
    for chapter_id, text in chapter_texts.items():
        seen: set[str] = set()
        refs: list[tuple[str, str]] = []
        for ref in extract_package_refs(text or ""):
            if ref.name in seen:
                continue
            seen.add(ref.name)
            refs.append((ref.name, ref.source))
        result[chapter_id] = refs
    return result


def refresh_path_package_lists(
    path_candidates: list[Candidate] | None,
    chapter_candidates: dict[UUID, list[Candidate]],
    chapter_to_refs: dict[UUID, list[tuple[str, str]]],
) -> tuple[list[Candidate], dict[UUID, list[Candidate]]]:
    """Aggregate fresh refs and merge prior approval status onto path + chapters."""
    path_new, chapter_new = aggregate_candidates(chapter_to_refs)
    merged_path = merge_status(path_candidates or [], path_new)
    chapter_ids = set(chapter_candidates) | set(chapter_new)
    merged_chapters = {
        cid: merge_status(
            chapter_candidates.get(cid) or [],
            chapter_new.get(cid, []),
        )
        for cid in chapter_ids
    }
    return merged_path, merged_chapters


def _outline_chapter_for(
    outline: dict | None,
    chapter: Any,
) -> dict | None:
    if not isinstance(outline, dict):
        return None
    chapters = outline.get("chapters") or []
    if not isinstance(chapters, list):
        return None
    sort_order = getattr(chapter, "sort_order", None)
    if isinstance(sort_order, int) and 1 <= sort_order <= len(chapters):
        item = chapters[sort_order - 1]
        if isinstance(item, dict):
            return item
    title = getattr(chapter, "title", None)
    for item in chapters:
        if isinstance(item, dict) and item.get("title") == title:
            return item
    return None


def apply_package_refresh(
    path: Any,
    chapters: Sequence[Any],
    *,
    outline: dict | None = None,
    chapter_skills: Mapping[UUID, Sequence[Any]] | None = None,
    chapter_exercises: Mapping[UUID, Sequence[Any]] | None = None,
) -> None:
    """Refresh path/chapter package_candidates from already-loaded objects."""
    skills_map = chapter_skills or {}
    exercises_map = chapter_exercises or {}
    outline_data = outline if outline is not None else getattr(path, "outline", None)
    chapter_texts: dict[UUID, str] = {}
    chapter_candidates: dict[UUID, list[Candidate]] = {}
    for chapter in chapters:
        skills = skills_map.get(chapter.id)
        if skills is None:
            skills = list(getattr(chapter, "skills", None) or [])
        exercises = exercises_map.get(chapter.id)
        if exercises is None:
            exercises = list(getattr(chapter, "exercises", None) or [])
        chapter_texts[chapter.id] = collect_chapter_scan_text(
            outline_chapter=_outline_chapter_for(outline_data, chapter),
            skills=skills,
            exercises=exercises,
        )
        chapter_candidates[chapter.id] = list(
            getattr(chapter, "package_candidates", None) or []
        )

    chapter_to_refs = build_chapter_refs_from_texts(chapter_texts)
    merged_path, merged_chapters = refresh_path_package_lists(
        list(getattr(path, "package_candidates", None) or []),
        chapter_candidates,
        chapter_to_refs,
    )
    path.package_candidates = merged_path
    for chapter in chapters:
        chapter.package_candidates = merged_chapters.get(chapter.id, [])


async def refresh_path_packages(db: AsyncSession, path: Any) -> None:
    """Load chapters from DB, refresh package_candidates, flush."""
    from app.models.models import Chapter

    result = await db.execute(
        select(Chapter)
        .where(Chapter.path_id == path.id)
        .options(
            selectinload(Chapter.skills),
            selectinload(Chapter.exercises),
        )
        .order_by(Chapter.sort_order)
    )
    chapters = list(result.scalars().all())
    apply_package_refresh(path, chapters)
    await db.flush()
