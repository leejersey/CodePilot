"""exercises add real judging fields

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-09-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("exercises", sa.Column("reference_solution", sa.Text(), nullable=True))
    op.add_column(
        "exercises",
        sa.Column("judge_mode", sa.String(length=20), nullable=False, server_default="judge0"),
    )
    op.add_column(
        "exercises",
        sa.Column("validation_status", sa.String(length=20), nullable=False, server_default="unverified"),
    )
    op.add_column("exercises", sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_exercises_validation_status", "exercises", ["validation_status"], unique=False)
    op.execute("UPDATE exercises SET status = 'draft', validation_status = 'unverified'")

    op.add_column(
        "exercise_submissions",
        sa.Column("test_results", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column("exercise_submissions", sa.Column("execution_time", sa.String(length=32), nullable=True))
    op.add_column("exercise_submissions", sa.Column("memory", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("exercise_submissions", "memory")
    op.drop_column("exercise_submissions", "execution_time")
    op.drop_column("exercise_submissions", "test_results")
    op.drop_index("ix_exercises_validation_status", table_name="exercises")
    op.drop_column("exercises", "validated_at")
    op.drop_column("exercises", "validation_status")
    op.drop_column("exercises", "judge_mode")
    op.drop_column("exercises", "reference_solution")
