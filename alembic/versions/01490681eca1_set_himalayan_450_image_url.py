"""set himalayan 450 image url

Revision ID: 01490681eca1
Revises: c4f4c38d27b5
Create Date: 2026-03-30 17:18:41.205080

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '01490681eca1'
down_revision: Union[str, Sequence[str], None] = 'c4f4c38d27b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE bike_models SET image_url = 'https://thenordicriders.com/wp-content/uploads/2025/10/RE_Himalayan_450.jpg' WHERE slug = 'himalayan-450'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE bike_models SET image_url = NULL WHERE slug = 'himalayan-450'"
    )
