"""add package_candidates to learning_paths and chapters

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-09-20
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "h8i9j0k1l2m3"
down_revision: Union[str, Sequence[str], None] = "g7h8i9j0k1l2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JSONB_EMPTY_ARRAY = sa.text("'[]'::jsonb")


def upgrade() -> None:
    op.add_column(
        "learning_paths",
        sa.Column(
            "package_candidates",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=_JSONB_EMPTY_ARRAY,
        ),
    )
    op.add_column(
        "chapters",
        sa.Column(
            "package_candidates",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=_JSONB_EMPTY_ARRAY,
        ),
    )


def downgrade() -> None:
    op.drop_column("chapters", "package_candidates")
    op.drop_column("learning_paths", "package_candidates")
