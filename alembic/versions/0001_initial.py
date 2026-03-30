"""initial schema + seed data (squashed)

Revision ID: 0001
Revises: (none)
Create Date: 2026-03-30

Migration unique qui cree le schema complet et insere les donnees par defaut.
Squash de toutes les migrations precedentes. Idempotente.
"""
from typing import Sequence, Union
from pathlib import Path
import json

from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes

revision: str = '0001'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Ordre d'insertion (respect des foreign keys)
SEED_TABLES = [
    "bike_models",
    "bike_model_configs",
    "bike_variants",
    "bike_consumables",
    "bike_accessory_patterns",
    "bike_variant_patterns",
    "bike_new_listing_patterns",
    "bike_exclusion_patterns",
    "bike_search_configs",
    "ads",
    "ad_attributes",
    "ad_images",
    "ad_accessories",
    "crawl_sessions",
    "crawl_session_ads",
    "ad_price_history",
    "accessory_overrides",
    "accessory_catalog_groups",
    "accessory_catalog_variants",
]

SERIAL_TABLES = {
    "bike_models": "bike_models_id_seq",
    "bike_model_configs": "bike_model_configs_id_seq",
    "bike_variants": "bike_variants_id_seq",
    "bike_consumables": "bike_consumables_id_seq",
    "bike_accessory_patterns": "bike_accessory_patterns_id_seq",
    "bike_variant_patterns": "bike_variant_patterns_id_seq",
    "bike_new_listing_patterns": "bike_new_listing_patterns_id_seq",
    "bike_exclusion_patterns": "bike_exclusion_patterns_id_seq",
    "bike_search_configs": "bike_search_configs_id_seq",
    "ad_attributes": "ad_attributes_id_seq",
    "ad_images": "ad_images_id_seq",
    "ad_accessories": "ad_accessories_id_seq",
    "crawl_sessions": "crawl_sessions_id_seq",
    "crawl_session_ads": "crawl_session_ads_id_seq",
    "ad_price_history": "ad_price_history_id_seq",
    "accessory_catalog_groups": "accessory_catalog_groups_id_seq",
    "accessory_catalog_variants": "accessory_catalog_variants_id_seq",
}


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = set(inspector.get_table_names())

    # ── Bike Models ──────────────────────────────────────────────────────

    if "bike_models" not in existing:
        op.create_table('bike_models',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('slug', sa.String(), nullable=False),
            sa.Column('brand', sa.String(), nullable=False),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('engine_cc', sa.Integer(), nullable=False),
            sa.Column('image_url', sa.String(), nullable=True),
            sa.Column('active', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('created_at', sa.String(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('slug'),
        )
        op.create_index('ix_bike_models_slug', 'bike_models', ['slug'], unique=True)

    if "bike_model_configs" not in existing:
        op.create_table('bike_model_configs',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('bike_model_id', sa.Integer(), sa.ForeignKey('bike_models.id', ondelete='CASCADE'), nullable=False, unique=True),
            sa.Column('warranty_years', sa.Integer(), nullable=False),
            sa.Column('warranty_value_per_year', sa.Integer(), nullable=False),
            sa.Column('mechanical_wear_per_km', sa.Float(), nullable=False),
            sa.Column('condition_risk_per_km', sa.Float(), nullable=False),
            sa.Column('short_term_km_threshold', sa.Integer(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )

    if "bike_variants" not in existing:
        op.create_table('bike_variants',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('bike_model_id', sa.Integer(), sa.ForeignKey('bike_models.id', ondelete='CASCADE'), nullable=False),
            sa.Column('variant_name', sa.String(), nullable=False),
            sa.Column('color', sa.String(), nullable=False),
            sa.Column('wheel_type', sa.String(), nullable=False, server_default='default'),
            sa.Column('new_price', sa.Integer(), nullable=False),
            sa.Column('color_hex', sa.String(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('bike_model_id', 'variant_name', 'color', 'wheel_type'),
        )
        op.create_index('ix_bike_variants_bike_model_id', 'bike_variants', ['bike_model_id'])

    if "bike_consumables" not in existing:
        op.create_table('bike_consumables',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('bike_model_id', sa.Integer(), sa.ForeignKey('bike_models.id', ondelete='CASCADE'), nullable=False),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('cost_eur', sa.Integer(), nullable=False),
            sa.Column('life_km', sa.Integer(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_bike_consumables_bike_model_id', 'bike_consumables', ['bike_model_id'])

    if "bike_accessory_patterns" not in existing:
        op.create_table('bike_accessory_patterns',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('bike_model_id', sa.Integer(), sa.ForeignKey('bike_models.id', ondelete='CASCADE'), nullable=False),
            sa.Column('regex_pattern', sa.String(), nullable=False),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('category', sa.String(), nullable=False),
            sa.Column('new_price', sa.Integer(), nullable=False),
            sa.Column('depreciation_rate', sa.Float(), nullable=False, server_default='0.65'),
            sa.Column('dedup_group', sa.String(), nullable=True),
            sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_bike_accessory_patterns_bike_model_id', 'bike_accessory_patterns', ['bike_model_id'])

    if "bike_variant_patterns" not in existing:
        op.create_table('bike_variant_patterns',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('bike_model_id', sa.Integer(), sa.ForeignKey('bike_models.id', ondelete='CASCADE'), nullable=False),
            sa.Column('regex_pattern', sa.String(), nullable=False),
            sa.Column('matched_variant', sa.String(), nullable=False),
            sa.Column('matched_color', sa.String(), nullable=True),
            sa.Column('matched_wheel_type', sa.String(), nullable=True),
            sa.Column('priority', sa.Integer(), nullable=False, server_default='0'),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_bike_variant_patterns_bike_model_id', 'bike_variant_patterns', ['bike_model_id'])

    if "bike_new_listing_patterns" not in existing:
        op.create_table('bike_new_listing_patterns',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('bike_model_id', sa.Integer(), sa.ForeignKey('bike_models.id', ondelete='CASCADE'), nullable=False),
            sa.Column('regex_pattern', sa.String(), nullable=False),
            sa.Column('category', sa.String(), nullable=False),
            sa.Column('weight', sa.Float(), nullable=False, server_default='1.0'),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_bike_new_listing_patterns_bike_model_id', 'bike_new_listing_patterns', ['bike_model_id'])

    if "bike_exclusion_patterns" not in existing:
        op.create_table('bike_exclusion_patterns',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('bike_model_id', sa.Integer(), sa.ForeignKey('bike_models.id', ondelete='CASCADE'), nullable=False),
            sa.Column('regex_pattern', sa.String(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_bike_exclusion_patterns_bike_model_id', 'bike_exclusion_patterns', ['bike_model_id'])

    if "bike_search_configs" not in existing:
        op.create_table('bike_search_configs',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('bike_model_id', sa.Integer(), sa.ForeignKey('bike_models.id', ondelete='CASCADE'), nullable=False),
            sa.Column('keyword', sa.String(), nullable=False),
            sa.Column('min_cc', sa.Integer(), nullable=True),
            sa.Column('max_cc', sa.Integer(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_bike_search_configs_bike_model_id', 'bike_search_configs', ['bike_model_id'])

    # ── Ads ───────────────────────────────────────────────────────────────

    if "ads" not in existing:
        op.create_table('ads',
            sa.Column('id', sa.BigInteger(), nullable=False),
            sa.Column('url', sa.String(), nullable=False),
            sa.Column('subject', sa.String(), nullable=True),
            sa.Column('body', sa.String(), nullable=True),
            sa.Column('price', sa.Float(), nullable=True),
            sa.Column('brand', sa.String(), nullable=True),
            sa.Column('model', sa.String(), nullable=True),
            sa.Column('year', sa.Integer(), nullable=True),
            sa.Column('mileage_km', sa.Integer(), nullable=True),
            sa.Column('engine_size_cc', sa.Integer(), nullable=True),
            sa.Column('fuel_type', sa.String(), nullable=True),
            sa.Column('color', sa.String(), nullable=True),
            sa.Column('category_name', sa.String(), nullable=True),
            sa.Column('ad_type', sa.String(), nullable=True),
            sa.Column('status', sa.String(), nullable=True),
            sa.Column('has_phone', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('city', sa.String(), nullable=True),
            sa.Column('zipcode', sa.String(), nullable=True),
            sa.Column('department', sa.String(), nullable=True),
            sa.Column('region', sa.String(), nullable=True),
            sa.Column('lat', sa.Float(), nullable=True),
            sa.Column('lng', sa.Float(), nullable=True),
            sa.Column('seller_type', sa.String(), nullable=True),
            sa.Column('first_publication_date', sa.String(), nullable=True),
            sa.Column('expiration_date', sa.String(), nullable=True),
            sa.Column('variant', sa.String(), nullable=True),
            sa.Column('wheel_type', sa.String(), nullable=True),
            sa.Column('estimated_new_price', sa.Float(), nullable=True),
            sa.Column('extracted_at', sa.String(), nullable=False),
            sa.Column('updated_at', sa.String(), nullable=False),
            sa.Column('accessories_manual', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('sold', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('previous_ad_id', sa.BigInteger(), nullable=True),
            sa.Column('superseded_by', sa.BigInteger(), nullable=True),
            sa.Column('bike_model_id', sa.Integer(), sa.ForeignKey('bike_models.id'), nullable=True),
            sa.Column('needs_crosscheck', sa.Integer(), nullable=False, server_default='0'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('url'),
        )
        op.create_index('ix_ads_price', 'ads', ['price'])
        op.create_index('ix_ads_year', 'ads', ['year'])
        op.create_index('ix_ads_mileage_km', 'ads', ['mileage_km'])
        op.create_index('ix_ads_variant', 'ads', ['variant'])
        op.create_index('ix_ads_department', 'ads', ['department'])
        op.create_index('ix_ads_sold', 'ads', ['sold'])
        op.create_index('ix_ads_superseded_by', 'ads', ['superseded_by'])
        op.create_index('ix_ads_bike_model_id', 'ads', ['bike_model_id'])

    if "ad_attributes" not in existing:
        op.create_table('ad_attributes',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('ad_id', sa.BigInteger(), sa.ForeignKey('ads.id', ondelete='CASCADE'), nullable=False),
            sa.Column('key', sa.String(), nullable=False),
            sa.Column('value', sa.String(), nullable=True),
            sa.Column('value_label', sa.String(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('ad_id', 'key'),
        )
        op.create_index('ix_ad_attributes_ad_id', 'ad_attributes', ['ad_id'])

    if "ad_images" not in existing:
        op.create_table('ad_images',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('ad_id', sa.BigInteger(), sa.ForeignKey('ads.id', ondelete='CASCADE'), nullable=False),
            sa.Column('url', sa.String(), nullable=False),
            sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
            sa.PrimaryKeyConstraint('id'),
        )

    if "ad_accessories" not in existing:
        op.create_table('ad_accessories',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('ad_id', sa.BigInteger(), sa.ForeignKey('ads.id', ondelete='CASCADE'), nullable=False),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('category', sa.String(), nullable=True),
            sa.Column('source', sa.String(), nullable=True),
            sa.Column('estimated_new_price', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('estimated_used_price', sa.Integer(), nullable=False, server_default='0'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('ad_id', 'name'),
        )
        op.create_index('ix_ad_accessories_ad_id', 'ad_accessories', ['ad_id'])

    # ── Crawl ─────────────────────────────────────────────────────────────

    if "crawl_sessions" not in existing:
        op.create_table('crawl_sessions',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('status', sa.String(), nullable=False, server_default='active'),
            sa.Column('total_ads', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('created_at', sa.String(), nullable=False),
            sa.Column('bike_model_id', sa.Integer(), sa.ForeignKey('bike_models.id'), nullable=True),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_crawl_sessions_bike_model_id', 'crawl_sessions', ['bike_model_id'])

    if "crawl_session_ads" not in existing:
        op.create_table('crawl_session_ads',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('session_id', sa.Integer(), sa.ForeignKey('crawl_sessions.id', ondelete='CASCADE'), nullable=False),
            sa.Column('ad_id', sa.BigInteger(), nullable=False),
            sa.Column('url', sa.String(), nullable=False),
            sa.Column('subject', sa.String(), nullable=True),
            sa.Column('price', sa.Float(), nullable=True),
            sa.Column('city', sa.String(), nullable=True),
            sa.Column('department', sa.String(), nullable=True),
            sa.Column('thumbnail', sa.String(), nullable=True),
            sa.Column('exists_in_db', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('action', sa.String(), nullable=False, server_default='pending'),
            sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('is_new_listing', sa.Integer(), nullable=False, server_default='0'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('session_id', 'ad_id'),
        )
        op.create_index('ix_crawl_session_ads_session_id', 'crawl_session_ads', ['session_id'])

    # ── Price History ─────────────────────────────────────────────────────

    if "ad_price_history" not in existing:
        op.create_table('ad_price_history',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('ad_id', sa.BigInteger(), sa.ForeignKey('ads.id', ondelete='CASCADE'), nullable=False),
            sa.Column('previous_ad_id', sa.BigInteger(), nullable=True),
            sa.Column('price', sa.Float(), nullable=False),
            sa.Column('source', sa.String(), nullable=False),
            sa.Column('note', sa.String(), nullable=True),
            sa.Column('recorded_at', sa.String(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_ad_price_history_ad_id', 'ad_price_history', ['ad_id'])

    # ── Accessory Overrides ───────────────────────────────────────────────

    if "accessory_overrides" not in existing:
        op.create_table('accessory_overrides',
            sa.Column('bike_model_id', sa.Integer(), nullable=False),
            sa.Column('group_key', sa.String(), nullable=False),
            sa.Column('estimated_new_price', sa.Integer(), nullable=False),
            sa.PrimaryKeyConstraint('bike_model_id', 'group_key'),
        )

    # ── Accessory Catalog ─────────────────────────────────────────────────

    if "accessory_catalog_groups" not in existing:
        op.create_table('accessory_catalog_groups',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('group_key', sa.String(), nullable=False),
            sa.Column('model_id', sa.Integer(), nullable=True),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('category', sa.String(), nullable=False),
            sa.Column('expressions', sa.JSON(), server_default='[]', nullable=False),
            sa.Column('default_price', sa.Integer(), nullable=False),
            sa.Column('last_match_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('created_at', sa.String(), nullable=False),
            sa.Column('updated_at', sa.String(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('group_key'),
        )
        op.create_index('ix_accessory_catalog_groups_category', 'accessory_catalog_groups', ['category'])
        op.create_index('ix_accessory_catalog_groups_model_id', 'accessory_catalog_groups', ['model_id'])

    if "accessory_catalog_variants" not in existing:
        op.create_table('accessory_catalog_variants',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('group_id', sa.Integer(), sa.ForeignKey('accessory_catalog_groups.id', ondelete='CASCADE'), nullable=False),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('qualifiers', sa.JSON(), server_default='[]', nullable=False),
            sa.Column('brands', sa.JSON(), server_default='[]', nullable=False),
            sa.Column('product_aliases', sa.JSON(), server_default='[]', nullable=False),
            sa.Column('optional_words', sa.JSON(), server_default='[]', nullable=False),
            sa.Column('regex_override', sa.Text(), nullable=True),
            sa.Column('estimated_new_price', sa.Integer(), nullable=False),
            sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('sort_order_manual', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('created_at', sa.String(), nullable=False),
            sa.Column('updated_at', sa.String(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('group_id', 'name'),
        )
        op.create_index('ix_accessory_catalog_variants_group_id', 'accessory_catalog_variants', ['group_id'])

    # ── Seed Data ─────────────────────────────────────────────────────────

    result = conn.execute(sa.text("SELECT COUNT(*) FROM ads"))
    if result.scalar() > 0:
        return  # Deja peuple

    seed_path = Path(__file__).resolve().parent.parent / "seed_data.json"
    if not seed_path.exists():
        return

    data = json.loads(seed_path.read_text(encoding="utf-8"))

    for table_name in SEED_TABLES:
        rows = data.get(table_name, [])
        if not rows:
            continue

        columns = list(rows[0].keys())
        col_list = ", ".join(columns)
        param_list = ", ".join(f":{c}" for c in columns)

        # JSON columns need to be serialized as strings for PostgreSQL
        for row in rows:
            for col in columns:
                if isinstance(row[col], (list, dict)):
                    row[col] = json.dumps(row[col])

        conn.execute(
            sa.text(f"INSERT INTO {table_name} ({col_list}) VALUES ({param_list})"),
            rows,
        )

    # Reset sequences
    for table_name, seq_name in SERIAL_TABLES.items():
        try:
            result = conn.execute(sa.text(f"SELECT MAX(id) FROM {table_name}"))
            max_id = result.scalar()
            if max_id is not None:
                conn.execute(sa.text(f"SELECT setval('{seq_name}', {max_id})"))
        except Exception:
            pass  # Table might not have data


def downgrade() -> None:
    for table in reversed(SEED_TABLES):
        op.drop_table(table)
