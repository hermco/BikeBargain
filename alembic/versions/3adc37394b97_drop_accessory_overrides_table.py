"""drop accessory_overrides table

Revision ID: 3adc37394b97
Revises: 7f055fcf0292
Create Date: 2026-03-30 02:04:53.260592

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3adc37394b97'
down_revision: Union[str, Sequence[str], None] = '7f055fcf0292'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'accessory_overrides' in inspector.get_table_names():
        op.drop_table("accessory_overrides")


def downgrade() -> None:
    op.create_table(
        "accessory_overrides",
        sa.Column("group_key", sa.String(), primary_key=True),
        sa.Column("estimated_new_price", sa.Integer(), nullable=False),
    )
