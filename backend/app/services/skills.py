"""Skill helpers: normalize outline skills and persist progress."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Chapter, Skill, SkillProgress

MAX_SKILLS_PER_CHAPTER = 6


def normalize_skills_from_chapter_item(
    item: dict | None,
    *,
    chapter_title: str | None = None,
) -> list[dict]:
    """Normalize LLM / outline chapter item into Skill row payloads.

    Prefers 3–6 skills from ``item["skills"]``; falls back to one skill
    derived from the chapter title when missing or empty.
    """
    raw = item.get("skills") if isinstance(item, dict) else None
    out: list[dict] = []
    if isinstance(raw, list):
        for entry in raw:
            if not isinstance(entry, dict):
                continue
            title = str(entry.get("title") or "").strip()
            if not title:
                continue
            objectives = entry.get("objectives")
            if not isinstance(objectives, list):
                objectives = None
            else:
                objectives = [str(o).strip() for o in objectives if str(o).strip()][:8] or None
            minutes = entry.get("estimated_minutes")
            try:
                estimated = int(minutes) if minutes is not None else None
            except (TypeError, ValueError):
                estimated = None
            if estimated is not None and estimated <= 0:
                estimated = None
            out.append(
                {
                    "sort_order": len(out) + 1,
                    "title": title[:255],
                    "goal": (str(entry.get("goal") or "").strip() or None),
                    "objectives": objectives,
                    "teach_prompt": (str(entry.get("teach_prompt") or "").strip() or None),
                    "estimated_minutes": estimated,
                    "status": "published",
                }
            )
            if len(out) >= MAX_SKILLS_PER_CHAPTER:
                break

    if out:
        return out

    title = (
        (chapter_title or (item.get("title") if isinstance(item, dict) else None) or "本章要点")
        .strip()
    )[:255]
    summary = ""
    if isinstance(item, dict):
        summary = str(item.get("summary") or "").strip()
    return [
        {
            "sort_order": 1,
            "title": title,
            "goal": summary or f"掌握「{title}」的核心要点",
            "objectives": None,
            "teach_prompt": None,
            "estimated_minutes": None,
            "status": "published",
        }
    ]


def serialize_skill_summary(skill: Skill) -> dict:
    return {
        "id": skill.id,
        "sort_order": skill.sort_order,
        "title": skill.title,
        "goal": skill.goal,
    }


def group_skill_summaries(
    skills: list[Skill],
) -> dict[uuid.UUID, list[dict]]:
    """Group published skill summaries by chapter_id (sorted by sort_order)."""
    grouped: dict[uuid.UUID, list[dict]] = {}
    for skill in sorted(skills, key=lambda s: (s.chapter_id.hex, s.sort_order)):
        grouped.setdefault(skill.chapter_id, []).append(serialize_skill_summary(skill))
    return grouped


async def load_skill_summaries_for_chapters(
    db: AsyncSession,
    chapter_ids: list[uuid.UUID],
) -> dict[uuid.UUID, list[dict]]:
    if not chapter_ids:
        return {}
    result = await db.execute(
        select(Skill)
        .where(
            Skill.chapter_id.in_(chapter_ids),
            Skill.status == "published",
        )
        .order_by(Skill.chapter_id, Skill.sort_order)
    )
    return group_skill_summaries(list(result.scalars().all()))


async def create_skills_for_chapter(
    db: AsyncSession,
    chapter_id: uuid.UUID,
    item: dict | None,
    *,
    chapter_title: str | None = None,
) -> list[Skill]:
    payloads = normalize_skills_from_chapter_item(item, chapter_title=chapter_title)
    skills: list[Skill] = []
    for payload in payloads:
        skill = Skill(chapter_id=chapter_id, **payload)
        db.add(skill)
        skills.append(skill)
    await db.flush()
    return skills


async def ensure_chapter_skills(db: AsyncSession, chapter: Chapter) -> list[Skill]:
    result = await db.execute(
        select(Skill)
        .where(Skill.chapter_id == chapter.id)
        .order_by(Skill.sort_order)
    )
    skills = list(result.scalars().all())
    if skills:
        return skills
    return await create_skills_for_chapter(
        db,
        chapter.id,
        {"title": chapter.title, "summary": chapter.summary or ""},
        chapter_title=chapter.title,
    )


async def ensure_skill_progress(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    skills: list[Skill],
) -> dict[uuid.UUID, SkillProgress]:
    if not skills:
        return {}
    skill_ids = [s.id for s in skills]
    rows = list(
        (
            await db.execute(
                select(SkillProgress).where(
                    SkillProgress.user_id == user_id,
                    SkillProgress.skill_id.in_(skill_ids),
                )
            )
        ).scalars().all()
    )
    by_skill = {row.skill_id: row for row in rows}
    created = False
    for index, skill in enumerate(skills):
        if skill.id in by_skill:
            continue
        # Phase A: first skill is active; completing N sets N+1 to active.
        status = "active" if index == 0 else "locked"
        row = SkillProgress(
            user_id=user_id,
            skill_id=skill.id,
            status=status,
        )
        db.add(row)
        by_skill[skill.id] = row
        created = True
    if created:
        await db.flush()
    return by_skill


def serialize_skill(skill: Skill, progress: SkillProgress | None) -> dict:
    return {
        "id": skill.id,
        "chapter_id": skill.chapter_id,
        "sort_order": skill.sort_order,
        "title": skill.title,
        "goal": skill.goal,
        "objectives": skill.objectives,
        "teach_prompt": skill.teach_prompt,
        "status": skill.status,
        "estimated_minutes": skill.estimated_minutes,
        "progress_status": progress.status if progress else "locked",
        "mastery_score": progress.mastery_score if progress else 0,
        "attempts": progress.attempts if progress else 0,
        "passed_at": progress.passed_at if progress else None,
    }


def _previous_passed(skill: Skill, chapter_skills: list[Skill], progress_map: dict) -> bool:
    ordered = sorted(chapter_skills, key=lambda s: s.sort_order)
    for index, item in enumerate(ordered):
        if item.id != skill.id:
            continue
        if index == 0:
            return True
        prev = progress_map.get(ordered[index - 1].id)
        return bool(prev and prev.status == "passed")
    return False


async def start_skill(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    skill: Skill,
    chapter_skills: list[Skill],
) -> SkillProgress:
    progress_map = await ensure_skill_progress(db, user_id=user_id, skills=chapter_skills)
    row = progress_map[skill.id]
    if row.status == "passed":
        return row
    if row.status == "locked" and not _previous_passed(skill, chapter_skills, progress_map):
        raise PermissionError("请先完成上一技能")
    for other in chapter_skills:
        other_row = progress_map[other.id]
        if other.id != skill.id and other_row.status == "active":
            # Only one active skill; previously-active siblings stay startable
            # because start() allows locked when the previous skill is passed.
            other_row.status = "locked"
    row.status = "active"
    row.attempts = (row.attempts or 0) + 1
    await db.flush()
    return row


async def complete_skill(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    skill: Skill,
    chapter_skills: list[Skill],
) -> tuple[SkillProgress, SkillProgress | None]:
    progress_map = await ensure_skill_progress(db, user_id=user_id, skills=chapter_skills)
    row = progress_map[skill.id]
    if row.status == "locked":
        raise PermissionError("请先开始该技能")
    if row.status != "passed":
        row.status = "passed"
        row.passed_at = datetime.now(timezone.utc)
        if row.mastery_score < 60:
            row.mastery_score = 60
    next_row: SkillProgress | None = None
    ordered = sorted(chapter_skills, key=lambda s: s.sort_order)
    for index, item in enumerate(ordered):
        if item.id == skill.id and index + 1 < len(ordered):
            nxt = ordered[index + 1]
            next_row = progress_map[nxt.id]
            if next_row.status == "locked":
                next_row.status = "active"
            break
    await db.flush()
    return row, next_row
