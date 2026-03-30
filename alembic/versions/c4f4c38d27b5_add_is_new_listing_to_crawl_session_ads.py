"""add is_new_listing to crawl_session_ads

Revision ID: c4f4c38d27b5
Revises: 7a87eb8e4d15
Create Date: 2026-03-30 11:17:51.524212

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4f4c38d27b5'
down_revision: Union[str, Sequence[str], None] = '7a87eb8e4d15'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('crawl_session_ads')]
    if 'is_new_listing' not in columns:
        op.add_column('crawl_session_ads', sa.Column('is_new_listing', sa.Integer(), server_default='0', nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('crawl_session_ads', 'is_new_listing')
