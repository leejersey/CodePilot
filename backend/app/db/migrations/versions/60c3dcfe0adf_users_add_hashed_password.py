"""users_add_hashed_password

Revision ID: 60c3dcfe0adf
Revises: 9408a82f8774
Create Date: 2026-09-15 11:01:10.641139

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '60c3dcfe0adf'
down_revision: Union[str, Sequence[str], None] = '9408a82f8774'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('hashed_password', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'hashed_password')
