"""remove variant concept - color+wheel_type is now the primary identifier

Revision ID: a1b2c3d4e5f6
Revises: f63e6aae6ff8
Create Date: 2026-04-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '8cb540ad53ee'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Drop old unique constraint on bike_variants (variant_name, color, wheel_type)
    #    and create new one on (color, wheel_type) only
    op.drop_constraint(
        'bike_variants_bike_model_id_variant_name_color_wheel_type_key',
        'bike_variants', type_='unique',
    )
    op.create_unique_constraint(
        'uq_bike_variants_model_color_wheel',
        'bike_variants',
        ['bike_model_id', 'color', 'wheel_type'],
    )

    # 2. Make variant_name nullable
    op.alter_column('bike_variants', 'variant_name',
                    existing_type=sa.String(),
                    nullable=True)

    # 3. Set variant_name to NULL on all bike_variants
    op.execute("UPDATE bike_variants SET variant_name = NULL")

    # 4. Set variant to NULL on all ads (preserve color, wheel_type, estimated_new_price)
    op.execute("UPDATE ads SET variant = NULL")

    # 5. Make matched_variant nullable on bike_variant_patterns, then set to NULL
    op.alter_column('bike_variant_patterns', 'matched_variant',
                    existing_type=sa.String(),
                    nullable=True)
    op.execute("UPDATE bike_variant_patterns SET matched_variant = NULL")


def downgrade() -> None:
    # Restore variant data from color mappings
    op.execute("""
        UPDATE bike_variants SET variant_name = CASE
            WHEN color = 'Kaza Brown' THEN 'Base'
            WHEN color IN ('Slate Himalayan Salt', 'Slate Poppy Blue') THEN 'Pass'
            WHEN color IN ('Hanle Black', 'Kamet White') THEN 'Summit'
            WHEN color = 'Mana Black' THEN 'Mana Black'
            ELSE 'Unknown'
        END
    """)

    op.alter_column('bike_variants', 'variant_name',
                    existing_type=sa.String(),
                    nullable=False)

    op.drop_constraint('uq_bike_variants_model_color_wheel', 'bike_variants', type_='unique')
    op.create_unique_constraint(
        'bike_variants_bike_model_id_variant_name_color_wheel_type_key',
        'bike_variants',
        ['bike_model_id', 'variant_name', 'color', 'wheel_type'],
    )
