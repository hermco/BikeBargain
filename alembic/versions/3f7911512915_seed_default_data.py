"""seed default data

Revision ID: 3f7911512915
Revises: fe07f6fb591c
Create Date: 2026-03-18 11:31:19.525394

Insere les donnees par defaut extraites de la base SQLite initiale.
Les donnees sont dans alembic/seed_data.json.
Le seed est idempotent : si des ads existent deja, il ne fait rien.
"""
from typing import Sequence, Union
from pathlib import Path
import json

from alembic import op
import sqlalchemy as sa


revision: str = '3f7911512915'
down_revision: Union[str, Sequence[str], None] = 'fe07f6fb591c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Ordre d'insertion (respect des foreign keys)
TABLES_ORDERED = [
    "ads",
    "ad_attributes",
    "ad_images",
    "ad_accessories",
    "crawl_sessions",
    "crawl_session_ads",
    "ad_price_history",
    "accessory_overrides",
]

# Tables avec sequence SERIAL a resetter
SERIAL_TABLES = {
    "ad_attributes": "ad_attributes_id_seq",
    "ad_images": "ad_images_id_seq",
    "ad_accessories": "ad_accessories_id_seq",
    "crawl_sessions": "crawl_sessions_id_seq",
    "crawl_session_ads": "crawl_session_ads_id_seq",
    "ad_price_history": "ad_price_history_id_seq",
}


def upgrade() -> None:
    seed_path = Path(__file__).resolve().parent.parent / "seed_data.json"
    data = json.loads(seed_path.read_text(encoding="utf-8"))

    conn = op.get_bind()

    # Verifier si la DB contient deja des ads (idempotent)
    result = conn.execute(sa.text("SELECT COUNT(*) FROM ads"))
    if result.scalar() > 0:
        return

    for table_name in TABLES_ORDERED:
        rows = data.get(table_name, [])
        if not rows:
            continue

        columns = list(rows[0].keys())
        col_list = ", ".join(columns)
        param_list = ", ".join(f":{c}" for c in columns)

        conn.execute(
            sa.text(f"INSERT INTO {table_name} ({col_list}) VALUES ({param_list})"),
            rows,
        )

    # Resetter les sequences SERIAL pour que les prochains INSERT aient le bon id
    for table_name, seq_name in SERIAL_TABLES.items():
        result = conn.execute(sa.text(f"SELECT MAX(id) FROM {table_name}"))
        max_id = result.scalar()
        if max_id is not None:
            conn.execute(sa.text(f"SELECT setval('{seq_name}', {max_id})"))


def downgrade() -> None:
    conn = op.get_bind()
    for table_name in reversed(TABLES_ORDERED):
        conn.execute(sa.text(f"DELETE FROM {table_name}"))
