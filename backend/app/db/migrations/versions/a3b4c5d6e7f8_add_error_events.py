"""add error events

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-09-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a3b4c5d6e7f8"
down_revision: Union[str, Sequence[str], None] = "f2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "error_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("error_id", sa.String(length=32), nullable=False),
        sa.Column("service", sa.String(length=40), nullable=False),
        sa.Column("level", sa.String(length=20), nullable=False, server_default="error"),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("exception_type", sa.String(length=200), nullable=True),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("path", sa.String(length=500), nullable=True),
        sa.Column("method", sa.String(length=10), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_error_events_error_id", "error_events", ["error_id"], unique=True)
    for column in (
        "service", "level", "request_id", "user_id",
        "path", "resolved_at", "created_at",
    ):
        op.create_index(f"ix_error_events_{column}", "error_events", [column])


def downgrade() -> None:
    for column in reversed((
        "service", "level", "request_id", "user_id",
        "path", "resolved_at", "created_at",
    )):
        op.drop_index(f"ix_error_events_{column}", table_name="error_events")
    op.drop_index("ix_error_events_error_id", table_name="error_events")
    op.drop_table("error_events")
