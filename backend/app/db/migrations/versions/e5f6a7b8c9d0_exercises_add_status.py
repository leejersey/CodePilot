"""exercises add status for publish workflow

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-09-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "exercises",
        sa.Column("status", sa.String(length=20), nullable=False, server_default="published"),
    )
    op.create_index("ix_exercises_status", "exercises", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_exercises_status", table_name="exercises")
    op.drop_column("exercises", "status")
