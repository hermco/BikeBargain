"""initial schema

Revision ID: fe07f6fb591c
Revises:
Create Date: 2026-03-18

Migration initiale. Cree toutes les tables du schema.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes

revision: str = 'fe07f6fb591c'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = set(inspector.get_table_names())

    if "ads" not in existing:
        op.create_table('ads',
            sa.Column('id', sa.BigInteger(), nullable=False),
            sa.Column('url', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column('subject', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('body', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('price', sa.Float(), nullable=True),
            sa.Column('brand', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('model', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('year', sa.Integer(), nullable=True),
            sa.Column('mileage_km', sa.Integer(), nullable=True),
            sa.Column('engine_size_cc', sa.Integer(), nullable=True),
            sa.Column('fuel_type', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('color', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('category_name', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('ad_type', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('status', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('has_phone', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('city', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('zipcode', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('department', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('region', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('lat', sa.Float(), nullable=True),
            sa.Column('lng', sa.Float(), nullable=True),
            sa.Column('seller_type', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('first_publication_date', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('expiration_date', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('variant', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('wheel_type', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('estimated_new_price', sa.Float(), nullable=True),
            sa.Column('extracted_at', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column('updated_at', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column('accessories_manual', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('sold', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('previous_ad_id', sa.BigInteger(), nullable=True),
            sa.Column('superseded_by', sa.BigInteger(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('url'),
        )
        op.create_index('ix_ads_price', 'ads', ['price'])
        op.create_index('ix_ads_year', 'ads', ['year'])
        op.create_index('ix_ads_mileage_km', 'ads', ['mileage_km'])
        op.create_index('ix_ads_variant', 'ads', ['variant'])
        op.create_index('ix_ads_department', 'ads', ['department'])

    if "ad_attributes" not in existing:
        op.create_table('ad_attributes',
            sa.Column('ad_id', sa.BigInteger(), sa.ForeignKey('ads.id', ondelete='CASCADE'), nullable=False),
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('key', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column('value', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('value_label', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('ad_id', 'key'),
        )
        op.create_index('ix_ad_attributes_ad_id', 'ad_attributes', ['ad_id'])

    if "ad_images" not in existing:
        op.create_table('ad_images',
            sa.Column('ad_id', sa.BigInteger(), sa.ForeignKey('ads.id', ondelete='CASCADE'), nullable=False),
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('url', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
            sa.PrimaryKeyConstraint('id'),
        )

    if "ad_accessories" not in existing:
        op.create_table('ad_accessories',
            sa.Column('ad_id', sa.BigInteger(), sa.ForeignKey('ads.id', ondelete='CASCADE'), nullable=False),
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column('category', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('source', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('estimated_new_price', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('estimated_used_price', sa.Integer(), nullable=False, server_default='0'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('ad_id', 'name'),
        )
        op.create_index('ix_ad_accessories_ad_id', 'ad_accessories', ['ad_id'])

    if "crawl_sessions" not in existing:
        op.create_table('crawl_sessions',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('status', sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default='active'),
            sa.Column('total_ads', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('created_at', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )

    if "crawl_session_ads" not in existing:
        op.create_table('crawl_session_ads',
            sa.Column('session_id', sa.Integer(), sa.ForeignKey('crawl_sessions.id', ondelete='CASCADE'), nullable=False),
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('ad_id', sa.BigInteger(), nullable=False),
            sa.Column('url', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column('subject', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('price', sa.Float(), nullable=True),
            sa.Column('city', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('department', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('thumbnail', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('exists_in_db', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('action', sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default='pending'),
            sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('session_id', 'ad_id'),
        )
        op.create_index('ix_crawl_session_ads_session_id', 'crawl_session_ads', ['session_id'])

    if "ad_price_history" not in existing:
        op.create_table('ad_price_history',
            sa.Column('ad_id', sa.BigInteger(), sa.ForeignKey('ads.id', ondelete='CASCADE'), nullable=False),
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('previous_ad_id', sa.BigInteger(), nullable=True),
            sa.Column('price', sa.Float(), nullable=False),
            sa.Column('source', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column('note', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
            sa.Column('recorded_at', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_ad_price_history_ad_id', 'ad_price_history', ['ad_id'])

    if "accessory_overrides" not in existing:
        op.create_table('accessory_overrides',
            sa.Column('group_key', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column('estimated_new_price', sa.Integer(), nullable=False),
            sa.PrimaryKeyConstraint('group_key'),
        )


def downgrade() -> None:
    op.drop_table('accessory_overrides')
    op.drop_table('ad_price_history')
    op.drop_table('crawl_session_ads')
    op.drop_table('crawl_sessions')
    op.drop_table('ad_accessories')
    op.drop_table('ad_images')
    op.drop_table('ad_attributes')
    op.drop_table('ads')
