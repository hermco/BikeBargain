"""replace sold with listing_status add status_history

Revision ID: 8cb540ad53ee
Revises: f63e6aae6ff8
Create Date: 2026-03-31 22:40:34.849533

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8cb540ad53ee'
down_revision: Union[str, Sequence[str], None] = 'f63e6aae6ff8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Create ad_status_history table
    op.create_table('ad_status_history',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('ad_id', sa.BigInteger(), nullable=False),
        sa.Column('old_status', sa.VARCHAR(), nullable=False),
        sa.Column('new_status', sa.VARCHAR(), nullable=False),
        sa.Column('reason', sa.VARCHAR(), nullable=True),
        sa.Column('changed_at', sa.VARCHAR(), nullable=False),
        sa.ForeignKeyConstraint(['ad_id'], ['ads.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_ad_status_history_ad_id'), 'ad_status_history', ['ad_id'], unique=False)

    # 2. Add listing_status column with server default
    op.add_column('ads', sa.Column('listing_status', sa.VARCHAR(), server_default='online', nullable=False))
    op.create_index(op.f('ix_ads_listing_status'), 'ads', ['listing_status'], unique=False)

    # 3. Backfill from sold
    op.execute("UPDATE ads SET listing_status = 'sold' WHERE sold = 1")
    op.execute("UPDATE ads SET listing_status = 'online' WHERE sold = 0")

    # 4. Drop sold column and its index
    op.drop_index(op.f('ix_ads_sold'), table_name='ads')
    op.drop_column('ads', 'sold')


def downgrade() -> None:
    """Downgrade schema."""
    # Re-add sold column
    op.add_column('ads', sa.Column('sold', sa.INTEGER(), server_default=sa.text('0'), autoincrement=False, nullable=False))
    op.create_index(op.f('ix_ads_sold'), 'ads', ['sold'], unique=False)

    # Backfill sold from listing_status
    op.execute("UPDATE ads SET sold = 1 WHERE listing_status IN ('sold', 'paused')")
    op.execute("UPDATE ads SET sold = 0 WHERE listing_status = 'online'")

    # Drop listing_status
    op.drop_index(op.f('ix_ads_listing_status'), table_name='ads')
    op.drop_column('ads', 'listing_status')

    # Drop ad_status_history table
    op.drop_index(op.f('ix_ad_status_history_ad_id'), table_name='ad_status_history')
    op.drop_table('ad_status_history')
