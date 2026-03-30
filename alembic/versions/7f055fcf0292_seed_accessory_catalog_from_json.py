"""seed accessory catalog from json

Revision ID: 7f055fcf0292
Revises: 70ba16288b15
Create Date: 2026-03-30 01:26:11.408378

"""
import json
from pathlib import Path
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7f055fcf0292'
down_revision: Union[str, Sequence[str], None] = '70ba16288b15'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SEED_FILE = Path(__file__).resolve().parent.parent / "seed_accessory_catalog.json"


def upgrade() -> None:
    conn = op.get_bind()

    # Idempotent: skip if groups already exist
    result = conn.execute(sa.text("SELECT COUNT(*) FROM accessory_catalog_groups"))
    if result.scalar() > 0:
        return

    with open(SEED_FILE) as f:
        data = json.load(f)

    for group_data in data["groups"]:
        conn.execute(
            sa.text("""
                INSERT INTO accessory_catalog_groups
                    (group_key, name, category, expressions, default_price, last_match_count, created_at, updated_at)
                VALUES
                    (:group_key, :name, :category, :expressions, :default_price, 0, now(), now())
            """),
            {
                "group_key": group_data["group_key"],
                "name": group_data["name"],
                "category": group_data["category"],
                "expressions": json.dumps(group_data["expressions"]),
                "default_price": group_data["default_price"],
            },
        )

        # Get the group id
        group_id = conn.execute(
            sa.text("SELECT id FROM accessory_catalog_groups WHERE group_key = :gk"),
            {"gk": group_data["group_key"]},
        ).scalar()

        for variant in group_data["variants"]:
            conn.execute(
                sa.text("""
                    INSERT INTO accessory_catalog_variants
                        (group_id, name, qualifiers, brands, product_aliases, optional_words,
                         regex_override, estimated_new_price, sort_order, sort_order_manual,
                         notes, created_at, updated_at)
                    VALUES
                        (:group_id, :name, :qualifiers, :brands, :product_aliases, :optional_words,
                         :regex_override, :estimated_new_price, :sort_order, 0,
                         :notes, now(), now())
                """),
                {
                    "group_id": group_id,
                    "name": variant["name"],
                    "qualifiers": json.dumps(variant["qualifiers"]),
                    "brands": json.dumps(variant["brands"]),
                    "product_aliases": json.dumps(variant["product_aliases"]),
                    "optional_words": json.dumps(variant["optional_words"]),
                    "regex_override": variant.get("regex_override"),
                    "estimated_new_price": variant["estimated_new_price"],
                    "sort_order": variant["sort_order"],
                    "notes": variant.get("notes"),
                },
            )

    # Migrate existing AccessoryOverride prices into variant estimated_new_price
    try:
        overrides = conn.execute(sa.text("SELECT group_key, estimated_new_price FROM accessory_overrides")).fetchall()
        for group_key, price in overrides:
            conn.execute(
                sa.text("""
                    UPDATE accessory_catalog_variants v
                    SET estimated_new_price = :price, updated_at = now()
                    FROM accessory_catalog_groups g
                    WHERE v.group_id = g.id AND g.group_key = :gk
                """),
                {"price": price, "gk": group_key},
            )
    except Exception:
        pass  # Table already dropped or doesn't exist

    # Reset sequences
    conn.execute(sa.text("""
        SELECT setval('accessory_catalog_groups_id_seq', (SELECT COALESCE(MAX(id), 0) FROM accessory_catalog_groups));
    """))
    conn.execute(sa.text("""
        SELECT setval('accessory_catalog_variants_id_seq', (SELECT COALESCE(MAX(id), 0) FROM accessory_catalog_variants));
    """))


def downgrade() -> None:
    op.execute("DELETE FROM accessory_catalog_variants")
    op.execute("DELETE FROM accessory_catalog_groups")
