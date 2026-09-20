"""add skills and skill_progress

Revision ID: g7h8i9j0k1l2
Revises: d6e7f8a9b0c1
Create Date: 2026-09-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "g7h8i9j0k1l2"
down_revision: Union[str, Sequence[str], None] = "d6e7f8a9b0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "skills",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chapter_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("goal", sa.Text(), nullable=True),
        sa.Column("objectives", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("teach_prompt", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="published"),
        sa.Column("estimated_minutes", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("status IN ('draft', 'published')", name="ck_skills_status"),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("chapter_id", "sort_order", name="uq_skills_chapter_order"),
    )
    op.create_index("ix_skills_chapter_id", "skills", ["chapter_id"])
    op.create_index("ix_skills_status", "skills", ["status"])

    op.create_table(
        "skill_progress",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("skill_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="locked"),
        sa.Column("mastery_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("passed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "status IN ('locked', 'active', 'passed', 'needs_review')",
            name="ck_skill_progress_status",
        ),
        sa.ForeignKeyConstraint(["skill_id"], ["skills.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "skill_id", name="uq_skill_progress_user_skill"),
    )
    op.create_index("ix_skill_progress_user_id", "skill_progress", ["user_id"])
    op.create_index("ix_skill_progress_skill_id", "skill_progress", ["skill_id"])
    op.create_index("ix_skill_progress_status", "skill_progress", ["status"])


def downgrade() -> None:
    op.drop_index("ix_skill_progress_status", table_name="skill_progress")
    op.drop_index("ix_skill_progress_skill_id", table_name="skill_progress")
    op.drop_index("ix_skill_progress_user_id", table_name="skill_progress")
    op.drop_table("skill_progress")
    op.drop_index("ix_skills_status", table_name="skills")
    op.drop_index("ix_skills_chapter_id", table_name="skills")
    op.drop_table("skills")
