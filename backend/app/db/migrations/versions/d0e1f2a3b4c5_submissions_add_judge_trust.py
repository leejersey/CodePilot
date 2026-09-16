"""submissions add judge trust

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-09-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d0e1f2a3b4c5"
down_revision: Union[str, Sequence[str], None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "exercise_submissions",
        sa.Column("judge_source", sa.String(length=20), nullable=False, server_default="judge0"),
    )
    op.add_column(
        "exercise_submissions",
        sa.Column("trusted", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("exercise_submissions", "trusted")
    op.drop_column("exercise_submissions", "judge_source")
