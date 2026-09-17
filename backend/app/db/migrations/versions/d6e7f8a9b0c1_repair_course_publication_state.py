"""repair courses whose status and visibility diverged, then forbid divergence

Revision b4c5d6e7f8a9 migrated every legacy learning path as
``status='published', visibility='private'``. No transition in the lifecycle can
produce or leave that pair: the owner cannot submit it for review or rebuild it,
and an administrator cannot review or publish it. This migration moves those
rows to ``draft``/``private`` — a private course its owner may rebuild and an
administrator may publish — and adds a CHECK constraint so ``status`` and
``visibility`` can never diverge again.

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-09-17
"""

from typing import Sequence, Union

from alembic import op


revision: str = "d6e7f8a9b0c1"
down_revision: Union[str, Sequence[str], None] = "c5d6e7f8a9b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Published-but-private courses were never reachable through the API, so
    # every such row came from the legacy backfill and belongs in draft.
    op.execute(
        """
        UPDATE courses
        SET status = 'draft',
            visibility = 'private',
            published_at = NULL
        WHERE status = 'published' AND visibility <> 'published'
        """
    )
    # The mirror image is equally unreachable; keep the catalog authoritative.
    op.execute(
        """
        UPDATE courses
        SET visibility = 'private'
        WHERE status <> 'published' AND visibility <> 'private'
        """
    )
    # On a fresh install the legacy backfill in b4c5d6e7f8a9 runs in this same
    # transaction and leaves deferred foreign-key events queued, which PostgreSQL
    # refuses to ALTER TABLE past. Flush them, then restore the declared mode.
    op.execute("SET CONSTRAINTS ALL IMMEDIATE")
    op.create_check_constraint(
        "ck_courses_status_visibility",
        "courses",
        "(status = 'published') = (visibility = 'published')",
    )
    op.execute("SET CONSTRAINTS ALL DEFERRED")


def downgrade() -> None:
    op.drop_constraint("ck_courses_status_visibility", "courses", type_="check")
