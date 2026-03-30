"""add accessory catalog tables and needs_crosscheck

Revision ID: 70ba16288b15
Revises: bb67b9f73556
Create Date: 2026-03-30 01:24:23.080353

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision: str = '70ba16288b15'
down_revision: Union[str, Sequence[str], None] = 'bb67b9f73556'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # --- Accessory catalog groups ---
    if 'accessory_catalog_groups' not in existing_tables:
        op.create_table('accessory_catalog_groups',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('group_key', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column('model_id', sa.Integer(), nullable=True),
            sa.Column('name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column('category', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column('expressions', sa.JSON(), server_default='[]', nullable=False),
            sa.Column('default_price', sa.Integer(), nullable=False),
            sa.Column('last_match_count', sa.Integer(), nullable=False),
            sa.Column('created_at', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column('updated_at', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('group_key'),
        )
        op.create_index('ix_accessory_catalog_groups_category', 'accessory_catalog_groups', ['category'], unique=False)
        op.create_index('ix_accessory_catalog_groups_model_id', 'accessory_catalog_groups', ['model_id'], unique=False)

    # --- Accessory catalog variants ---
    if 'accessory_catalog_variants' not in existing_tables:
        op.create_table('accessory_catalog_variants',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('group_id', sa.Integer(), nullable=False),
            sa.Column('name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column('qualifiers', sa.JSON(), server_default='[]', nullable=False),
            sa.Column('brands', sa.JSON(), server_default='[]', nullable=False),
            sa.Column('product_aliases', sa.JSON(), server_default='[]', nullable=False),
            sa.Column('optional_words', sa.JSON(), server_default='[]', nullable=False),
            sa.Column('regex_override', sa.Text(), nullable=True),
            sa.Column('estimated_new_price', sa.Integer(), nullable=False),
            sa.Column('sort_order', sa.Integer(), nullable=False),
            sa.Column('sort_order_manual', sa.Integer(), nullable=False),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('created_at', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column('updated_at', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.ForeignKeyConstraint(['group_id'], ['accessory_catalog_groups.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('group_id', 'name'),
        )
        op.create_index(op.f('ix_accessory_catalog_variants_group_id'), 'accessory_catalog_variants', ['group_id'], unique=False)

    # --- needs_crosscheck column on ads ---
    ads_columns = [c['name'] for c in inspector.get_columns('ads')]
    if 'needs_crosscheck' not in ads_columns:
        op.add_column('ads', sa.Column('needs_crosscheck', sa.Integer(), server_default='0', nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('ads', 'needs_crosscheck')
    op.drop_index(op.f('ix_accessory_catalog_variants_group_id'), table_name='accessory_catalog_variants')
    op.drop_table('accessory_catalog_variants')
    op.drop_index('ix_accessory_catalog_groups_model_id', table_name='accessory_catalog_groups')
    op.drop_index('ix_accessory_catalog_groups_category', table_name='accessory_catalog_groups')
    op.drop_table('accessory_catalog_groups')
