"""Admin review API for course Modal package candidates."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import require_admin
from app.db.database import get_db
from app.models.models import LearningPath, User
from app.schemas.schemas import PackageCandidateOut, PackageStatusUpdate

router = APIRouter()


async def _get_path_with_chapters(
    db: AsyncSession, path_id: uuid.UUID
) -> LearningPath:
    result = await db.execute(
        select(LearningPath)
        .options(selectinload(LearningPath.chapters))
        .where(LearningPath.id == path_id)
    )
    path = result.scalar_one_or_none()
    if not path:
        raise HTTPException(status_code=404, detail="学习路线不存在")
    return path


def _candidate_out(
    item: dict,
    *,
    scope: str,
    chapter_id: uuid.UUID | None = None,
) -> PackageCandidateOut:
    return PackageCandidateOut(
        name=item["name"],
        status=item.get("status", "pending"),
        source=item.get("source", "import"),
        reason=item.get("reason"),
        scope=scope,
        chapter_id=chapter_id,
    )


def _find_candidate(candidates: list | None, name: str) -> dict | None:
    for item in candidates or []:
        if item.get("name") == name:
            return item
    return None


@router.get("/{path_id}/packages", response_model=list[PackageCandidateOut])
async def list_path_packages(
    path_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    path = await _get_path_with_chapters(db, path_id)
    items: list[PackageCandidateOut] = []
    for item in path.package_candidates or []:
        items.append(_candidate_out(item, scope="path"))
    for chapter in path.chapters or []:
        for item in chapter.package_candidates or []:
            items.append(
                _candidate_out(item, scope="chapter", chapter_id=chapter.id)
            )
    return items


@router.patch("/{path_id}/packages", response_model=PackageCandidateOut)
async def update_package_status(
    path_id: uuid.UUID,
    body: PackageStatusUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    path = await _get_path_with_chapters(db, path_id)

    if body.scope == "path":
        target = _find_candidate(path.package_candidates, body.name)
        if target is None:
            raise HTTPException(status_code=404, detail="包候选不存在")
        target["status"] = body.status
        if body.reason is not None:
            target["reason"] = body.reason
        # JSONB mutation: reassign so SQLAlchemy detects change
        path.package_candidates = list(path.package_candidates or [])
        await db.commit()
        return _candidate_out(target, scope="path")

    chapter = next(
        (c for c in (path.chapters or []) if c.id == body.chapter_id),
        None,
    )
    if chapter is None:
        raise HTTPException(status_code=404, detail="章节不存在或不属于该路线")

    target = _find_candidate(chapter.package_candidates, body.name)
    if target is None:
        raise HTTPException(status_code=404, detail="包候选不存在")
    target["status"] = body.status
    if body.reason is not None:
        target["reason"] = body.reason
    chapter.package_candidates = list(chapter.package_candidates or [])
    await db.commit()
    return _candidate_out(target, scope="chapter", chapter_id=chapter.id)
