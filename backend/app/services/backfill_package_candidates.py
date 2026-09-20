"""One-off backfill: refresh package_candidates on existing learning paths."""

from __future__ import annotations

import argparse
import asyncio
import logging

from sqlalchemy import exists, select

from app.db.database import AsyncSessionLocal
from app.models.models import Chapter, LearningPath
from app.services.package_candidates import (
    KNOWN_SAFE_HINTS,
    Candidate,
    refresh_path_packages,
)

logger = logging.getLogger(__name__)


def auto_approve_known_safe_hints(
    candidates: list[Candidate],
) -> tuple[list[Candidate], list[str]]:
    """Promote pending candidates whose name is in KNOWN_SAFE_HINTS (backfill only)."""
    updated: list[Candidate] = []
    promoted: list[str] = []
    for item in candidates:
        name = item.get("name")
        if item.get("status") == "pending" and name in KNOWN_SAFE_HINTS:
            out = dict(item)
            out["status"] = "approved"
            updated.append(out)
            promoted.append(name)
        else:
            updated.append(dict(item))
    return updated, promoted


def _apply_auto_approve(path: LearningPath, chapters: list[Chapter]) -> list[str]:
    """Update path/chapter candidate lists in memory; return promoted package names."""
    lines: list[str] = []
    new_path, path_promoted = auto_approve_known_safe_hints(
        list(path.package_candidates or [])
    )
    if path_promoted:
        path.package_candidates = new_path
        for name in path_promoted:
            lines.append(f"  path {path.id}: {name} pending -> approved")

    for chapter in chapters:
        new_ch, ch_promoted = auto_approve_known_safe_hints(
            list(chapter.package_candidates or [])
        )
        if ch_promoted:
            chapter.package_candidates = new_ch
            for name in ch_promoted:
                lines.append(
                    f"  chapter {chapter.id} ({chapter.title!r}): {name} pending -> approved"
                )
    return lines


async def backfill_all(*, dry_run: bool) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(LearningPath)
            .where(
                exists(select(Chapter.id).where(Chapter.path_id == LearningPath.id))
            )
            .order_by(LearningPath.created_at)
        )
        paths = list(result.scalars().all())
        logger.info("Found %d learning path(s) with chapters", len(paths))

        change_lines: list[str] = []
        for path in paths:
            topic = path.topic
            logger.info("Refreshing packages for path %s (%s)", path.id, topic)
            await refresh_path_packages(db, path)

            ch_result = await db.execute(
                select(Chapter)
                .where(Chapter.path_id == path.id)
                .order_by(Chapter.sort_order)
            )
            chapters = list(ch_result.scalars().all())
            promoted = _apply_auto_approve(path, chapters)
            if promoted:
                change_lines.append(f"path {path.id} ({topic!r}):")
                change_lines.extend(promoted)

        if dry_run:
            await db.rollback()
            print("DRY RUN — no changes committed.")
        else:
            await db.commit()
            print("Committed backfill changes.")

        if change_lines:
            print("Auto-approved KNOWN_SAFE_HINTS:")
            print("\n".join(change_lines))
        else:
            print("No pending KNOWN_SAFE_HINTS candidates to auto-approve.")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Backfill package_candidates for existing learning paths.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print promotions without committing.",
    )
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO)
    asyncio.run(backfill_all(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
