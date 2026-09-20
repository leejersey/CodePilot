"""Chapter skills: list / start / complete (Phase A manual pass)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.database import get_db
from app.models.models import Chapter, Skill, User
from app.schemas.schemas import SkillListResponse, SkillResponse
from app.services.course_access import can_access_legacy_chapter
from app.services.skills import (
    complete_skill,
    ensure_chapter_skills,
    ensure_skill_progress,
    serialize_skill,
    start_skill,
)

router = APIRouter()


async def _load_chapter_or_404(
    db: AsyncSession, chapter_id: uuid.UUID, user: User
) -> Chapter:
    chapter = await db.scalar(select(Chapter).where(Chapter.id == chapter_id))
    if not chapter or not await can_access_legacy_chapter(
        db, chapter_id, user, require_enrollment=True
    ):
        raise HTTPException(status_code=404, detail="章节不存在")
    return chapter


async def _load_skill_or_404(db: AsyncSession, skill_id: uuid.UUID) -> Skill:
    skill = await db.scalar(select(Skill).where(Skill.id == skill_id))
    if not skill:
        raise HTTPException(status_code=404, detail="技能不存在")
    return skill


@router.get("/chapters/{chapter_id}/skills", response_model=SkillListResponse)
async def list_chapter_skills(
    chapter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    chapter = await _load_chapter_or_404(db, chapter_id, user)
    skills = await ensure_chapter_skills(db, chapter)
    progress_map = await ensure_skill_progress(db, user_id=user.id, skills=skills)
    await db.commit()
    return SkillListResponse(
        chapter_id=chapter.id,
        skills=[serialize_skill(s, progress_map.get(s.id)) for s in skills],
    )


@router.post("/skills/{skill_id}/start", response_model=SkillResponse)
async def start_chapter_skill(
    skill_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    skill = await _load_skill_or_404(db, skill_id)
    chapter = await _load_chapter_or_404(db, skill.chapter_id, user)
    skills = await ensure_chapter_skills(db, chapter)
    try:
        row = await start_skill(
            db, user_id=user.id, skill=skill, chapter_skills=skills
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    await db.commit()
    await db.refresh(row)
    return SkillResponse(**serialize_skill(skill, row))


@router.post("/skills/{skill_id}/complete", response_model=SkillResponse)
async def complete_chapter_skill(
    skill_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    skill = await _load_skill_or_404(db, skill_id)
    chapter = await _load_chapter_or_404(db, skill.chapter_id, user)
    skills = await ensure_chapter_skills(db, chapter)
    try:
        row, _ = await complete_skill(
            db, user_id=user.id, skill=skill, chapter_skills=skills
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    await db.commit()
    await db.refresh(row)
    return SkillResponse(**serialize_skill(skill, row))
