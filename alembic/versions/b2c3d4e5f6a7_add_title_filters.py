"""add bike_title_filters table and is_irrelevant column on crawl_session_ads

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'bike_title_filters',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('bike_model_id', sa.Integer, sa.ForeignKey('bike_models.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('filter_type', sa.String, nullable=False),
        sa.Column('regex_pattern', sa.String, nullable=False),
        sa.Column('description', sa.String, nullable=True),
    )

    op.add_column('crawl_session_ads', sa.Column('is_irrelevant', sa.Integer, server_default='0', nullable=False))

    # Seed : filtres pour Himalayan 450
    op.execute("""
        INSERT INTO bike_title_filters (bike_model_id, filter_type, regex_pattern, description)
        SELECT id, 'include', '(?i)himalayan|himlayan|hymalayan|himalyan', 'Nom du modele (variantes orthographiques)'
        FROM bike_models WHERE slug = 'himalayan-450'
    """)
    op.execute(r"""
        INSERT INTO bike_title_filters (bike_model_id, filter_type, regex_pattern, description)
        SELECT id, 'exclude', '(?i)\b411\b|\bbullet\s+500\b', 'Ancien modele Himalayan (411cc / Bullet 500)'
        FROM bike_models WHERE slug = 'himalayan-450'
    """)


def downgrade() -> None:
    op.drop_column('crawl_session_ads', 'is_irrelevant')
    op.drop_table('bike_title_filters')
