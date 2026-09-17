"""add auditable course version events

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-09-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "c5d6e7f8a9b0"
down_revision: Union[str, Sequence[str], None] = "b4c5d6e7f8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint(
        "course_version_knowledge_bases_kb_id_fkey",
        "course_version_knowledge_bases",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_course_version_kbs_kb_restrict",
        "course_version_knowledge_bases",
        "knowledge_bases",
        ["kb_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_table(
        "course_version_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("course_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("from_version_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("to_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=30), nullable=False),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["course_id", "from_version_id"],
            ["course_versions.course_id", "course_versions.id"],
            name="fk_course_version_events_from_same_course",
            deferrable=True,
            initially="DEFERRED",
        ),
        sa.ForeignKeyConstraint(
            ["course_id", "to_version_id"],
            ["course_versions.course_id", "course_versions.id"],
            name="fk_course_version_events_to_same_course",
            deferrable=True,
            initially="DEFERRED",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_course_version_events_course_id",
        "course_version_events",
        ["course_id"],
    )
    op.create_index(
        "ix_course_version_events_to_version_id",
        "course_version_events",
        ["to_version_id"],
    )
    op.create_index(
        "ix_course_version_events_actor_id",
        "course_version_events",
        ["actor_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_course_version_events_actor_id", table_name="course_version_events")
    op.drop_index(
        "ix_course_version_events_to_version_id",
        table_name="course_version_events",
    )
    op.drop_index("ix_course_version_events_course_id", table_name="course_version_events")
    op.drop_table("course_version_events")
    op.drop_constraint(
        "fk_course_version_kbs_kb_restrict",
        "course_version_knowledge_bases",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "course_version_knowledge_bases_kb_id_fkey",
        "course_version_knowledge_bases",
        "knowledge_bases",
        ["kb_id"],
        ["id"],
        ondelete="CASCADE",
    )
