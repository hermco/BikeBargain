"""
Base de donnees SQLite pour stocker les annonces Himalayan 450.
"""

import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Optional

DB_PATH = Path(__file__).resolve().parent.parent / "himalayan_450.db"


def get_connection(db_path: Optional[Path] = None) -> sqlite3.Connection:
    """Retourne une connexion SQLite avec row_factory activee."""
    path = db_path or DB_PATH
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    """Cree le schema si les tables n'existent pas encore."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS ads (
            id              INTEGER PRIMARY KEY,
            url             TEXT NOT NULL UNIQUE,
            subject         TEXT,
            body            TEXT,
            price           REAL,
            brand           TEXT,
            model           TEXT,
            year            INTEGER,
            mileage_km      INTEGER,
            engine_size_cc  INTEGER,
            fuel_type       TEXT,
            color           TEXT,
            category_name   TEXT,
            ad_type         TEXT,
            status          TEXT,
            has_phone       INTEGER DEFAULT 0,
            -- Localisation
            city            TEXT,
            zipcode         TEXT,
            department      TEXT,
            region          TEXT,
            lat             REAL,
            lng             REAL,
            -- Infos vendeur
            seller_type     TEXT,   -- 'pro' ou 'private'
            -- Dates
            first_publication_date TEXT,
            expiration_date        TEXT,
            -- Analyse Himalayan
            variant         TEXT,   -- Base / Pass / Summit / Mana Black
            wheel_type      TEXT,   -- standard / tubeless
            estimated_new_price REAL,
            -- Meta
            extracted_at    TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS ad_attributes (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            ad_id   INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
            key     TEXT NOT NULL,
            value   TEXT,
            value_label TEXT,
            UNIQUE(ad_id, key)
        );

        CREATE TABLE IF NOT EXISTS ad_images (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            ad_id   INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
            url     TEXT NOT NULL,
            position INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS ad_accessories (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            ad_id       INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
            name        TEXT NOT NULL,
            category    TEXT,  -- 'protection', 'bagagerie', 'confort', 'navigation', 'eclairage', 'esthetique', 'performance', 'autre'
            source      TEXT,  -- 'body' ou 'attribute'
            estimated_new_price   INTEGER DEFAULT 0,
            estimated_used_price  INTEGER DEFAULT 0,
            UNIQUE(ad_id, name)
        );

        CREATE INDEX IF NOT EXISTS idx_ads_price ON ads(price);
        CREATE INDEX IF NOT EXISTS idx_ads_year ON ads(year);
        CREATE INDEX IF NOT EXISTS idx_ads_mileage ON ads(mileage_km);
        CREATE INDEX IF NOT EXISTS idx_ads_variant ON ads(variant);
        CREATE INDEX IF NOT EXISTS idx_ads_department ON ads(department);
        CREATE INDEX IF NOT EXISTS idx_ad_attributes_ad_id ON ad_attributes(ad_id);
        CREATE INDEX IF NOT EXISTS idx_ad_accessories_ad_id ON ad_accessories(ad_id);

        -- Sessions de crawl (persistance des resultats de recherche)
        CREATE TABLE IF NOT EXISTS crawl_sessions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            status      TEXT NOT NULL DEFAULT 'active',  -- 'active', 'done'
            total_ads   INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS crawl_session_ads (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  INTEGER NOT NULL REFERENCES crawl_sessions(id) ON DELETE CASCADE,
            ad_id       INTEGER NOT NULL,
            url         TEXT NOT NULL,
            subject     TEXT,
            price       REAL,
            city        TEXT,
            department  TEXT,
            thumbnail   TEXT,
            exists_in_db INTEGER DEFAULT 0,
            action      TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'confirmed', 'skipped', 'error'
            position    INTEGER DEFAULT 0,
            UNIQUE(session_id, ad_id)
        );

        CREATE INDEX IF NOT EXISTS idx_crawl_session_ads_session ON crawl_session_ads(session_id);

        -- Historique des prix (reposts, baisses de prix)
        CREATE TABLE IF NOT EXISTS ad_price_history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            ad_id       INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
            previous_ad_id INTEGER,  -- l'ancienne annonce remplacee (si repost)
            price       REAL NOT NULL,
            source      TEXT NOT NULL,  -- 'initial', 'repost', 'manual'
            note        TEXT,
            recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_ad_price_history_ad ON ad_price_history(ad_id);

        -- Surcharges utilisateur des prix du catalogue d'accessoires
        CREATE TABLE IF NOT EXISTS accessory_overrides (
            group_key           TEXT PRIMARY KEY,
            estimated_new_price INTEGER NOT NULL
        );
    """)
    conn.commit()

    # Migrations
    cols = [r[1] for r in conn.execute("PRAGMA table_info(ads)").fetchall()]
    if "accessories_manual" not in cols:
        conn.execute("ALTER TABLE ads ADD COLUMN accessories_manual INTEGER NOT NULL DEFAULT 0")
        conn.commit()
    if "sold" not in cols:
        conn.execute("ALTER TABLE ads ADD COLUMN sold INTEGER NOT NULL DEFAULT 0")
        conn.commit()
    if "previous_ad_id" not in cols:
        conn.execute("ALTER TABLE ads ADD COLUMN previous_ad_id INTEGER")
        conn.commit()
    if "superseded_by" not in cols:
        conn.execute("ALTER TABLE ads ADD COLUMN superseded_by INTEGER")
        # Migration : marquer les anciennes annonces deja fusionnees
        conn.execute("""
            UPDATE ads SET superseded_by = (
                SELECT a2.id FROM ads a2 WHERE a2.previous_ad_id = ads.id
            )
            WHERE EXISTS (SELECT 1 FROM ads a2 WHERE a2.previous_ad_id = ads.id)
        """)
        conn.commit()


def upsert_ad(conn: sqlite3.Connection, ad_data: dict) -> int:
    """
    Insere ou met a jour une annonce.
    Retourne l'id de l'annonce.
    """
    now = datetime.now().isoformat()

    # Champs principaux
    fields = [
        "id", "url", "subject", "body", "price", "brand", "model",
        "year", "mileage_km", "engine_size_cc", "fuel_type", "color",
        "category_name", "ad_type", "status", "has_phone",
        "city", "zipcode", "department", "region", "lat", "lng",
        "seller_type", "first_publication_date", "expiration_date",
        "variant", "wheel_type", "estimated_new_price",
        "previous_ad_id",
    ]

    values = {f: ad_data.get(f) for f in fields}
    values["updated_at"] = now

    # Verifie si l'annonce existe deja
    existing = conn.execute("SELECT id FROM ads WHERE id = ?", (values["id"],)).fetchone()

    if existing:
        set_clause = ", ".join(f"{f} = :{f}" for f in fields if f != "id")
        set_clause += ", updated_at = :updated_at"
        conn.execute(f"UPDATE ads SET {set_clause} WHERE id = :id", values)
    else:
        values["extracted_at"] = now
        cols = ", ".join(values.keys())
        placeholders = ", ".join(f":{k}" for k in values.keys())
        conn.execute(f"INSERT INTO ads ({cols}) VALUES ({placeholders})", values)

    ad_id = values["id"]

    # Attributs
    if "attributes" in ad_data:
        conn.execute("DELETE FROM ad_attributes WHERE ad_id = ?", (ad_id,))
        for attr in ad_data["attributes"]:
            conn.execute(
                "INSERT OR IGNORE INTO ad_attributes (ad_id, key, value, value_label) VALUES (?, ?, ?, ?)",
                (ad_id, attr["key"], attr.get("value"), attr.get("value_label")),
            )

    # Images
    if "images" in ad_data:
        conn.execute("DELETE FROM ad_images WHERE ad_id = ?", (ad_id,))
        for i, url in enumerate(ad_data["images"]):
            conn.execute(
                "INSERT INTO ad_images (ad_id, url, position) VALUES (?, ?, ?)",
                (ad_id, url, i),
            )

    # Accessoires
    if "accessories" in ad_data:
        conn.execute("DELETE FROM ad_accessories WHERE ad_id = ?", (ad_id,))
        for acc in ad_data["accessories"]:
            conn.execute(
                "INSERT OR IGNORE INTO ad_accessories (ad_id, name, category, source, estimated_new_price, estimated_used_price) VALUES (?, ?, ?, ?, ?, ?)",
                (ad_id, acc["name"], acc.get("category"), acc.get("source"), acc.get("estimated_new_price", 0), acc.get("estimated_used_price", 0)),
            )

    conn.commit()
    return ad_id


def get_all_ads(conn: sqlite3.Connection, *, include_superseded: bool = False) -> list[dict]:
    """Retourne toutes les annonces avec leurs accessoires.

    Args:
        include_superseded: Si True, inclut aussi les annonces remplacees par un repost.
    """
    if include_superseded:
        rows = conn.execute("SELECT * FROM ads ORDER BY price ASC").fetchall()
    else:
        rows = conn.execute("SELECT * FROM ads WHERE superseded_by IS NULL ORDER BY price ASC").fetchall()
    results = []
    for row in rows:
        ad = dict(row)
        ad["accessories"] = [
            dict(r) for r in conn.execute(
                "SELECT name, category, source, estimated_new_price, estimated_used_price FROM ad_accessories WHERE ad_id = ?",
                (ad["id"],),
            ).fetchall()
        ]
        ad["images"] = [
            r["url"] for r in conn.execute(
                "SELECT url FROM ad_images WHERE ad_id = ? ORDER BY position",
                (ad["id"],),
            ).fetchall()
        ]
        results.append(ad)
    return results


def refresh_accessories(
    conn: sqlite3.Connection,
    *,
    skip_manual: bool = False,
    ad_ids: list[int] | None = None,
) -> list[dict]:
    """
    Re-detecte les accessoires des annonces en base
    en relancant les regex sur le body stocke.

    Utile apres une mise a jour des patterns dans accessories.py.

    Args:
        skip_manual: Si True, ignore les annonces dont les accessoires
            ont ete modifies manuellement par l'utilisateur.
        ad_ids: Si fourni, ne traite que ces annonces.

    Returns:
        Liste de dicts avec le resume par annonce :
        {"id": int, "city": str, "before": int, "after": int}
    """
    from .accessories import detect_accessories

    overrides = get_accessory_overrides(conn)

    query = "SELECT id, city, body, accessories_manual FROM ads"
    params: list = []
    clauses = []

    if skip_manual:
        clauses.append("accessories_manual = 0")
    if ad_ids is not None:
        placeholders = ",".join("?" for _ in ad_ids)
        clauses.append(f"id IN ({placeholders})")
        params.extend(ad_ids)

    if clauses:
        query += " WHERE " + " AND ".join(clauses)

    rows = conn.execute(query, params).fetchall()
    results = []

    for row in rows:
        ad_id, city, body = row["id"], row["city"], row["body"]

        before = conn.execute(
            "SELECT COUNT(*) FROM ad_accessories WHERE ad_id = ?", (ad_id,)
        ).fetchone()[0]

        accessories = detect_accessories(body or "", price_overrides=overrides)

        conn.execute("DELETE FROM ad_accessories WHERE ad_id = ?", (ad_id,))
        for acc in accessories:
            conn.execute(
                "INSERT OR IGNORE INTO ad_accessories (ad_id, name, category, source, estimated_new_price, estimated_used_price) VALUES (?, ?, ?, ?, ?, ?)",
                (ad_id, acc["name"], acc.get("category"), acc.get("source"),
                 acc.get("estimated_new_price", 0), acc.get("estimated_used_price", 0)),
            )

        results.append({
            "id": ad_id,
            "city": city,
            "before": before,
            "after": len(accessories),
        })

    conn.commit()
    return results


def get_accessory_overrides(conn: sqlite3.Connection) -> dict[str, int]:
    """Retourne les surcharges de prix {group_key: estimated_new_price}."""
    rows = conn.execute("SELECT group_key, estimated_new_price FROM accessory_overrides").fetchall()
    return {r["group_key"]: r["estimated_new_price"] for r in rows}


def set_accessory_override(conn: sqlite3.Connection, group_key: str, estimated_new_price: int) -> None:
    """Enregistre ou met a jour la surcharge de prix d'un groupe d'accessoires."""
    conn.execute(
        "INSERT INTO accessory_overrides (group_key, estimated_new_price) VALUES (?, ?) "
        "ON CONFLICT(group_key) DO UPDATE SET estimated_new_price = excluded.estimated_new_price",
        (group_key, estimated_new_price),
    )
    conn.commit()


def delete_accessory_override(conn: sqlite3.Connection, group_key: str) -> None:
    """Supprime la surcharge de prix d'un groupe (revient au prix par defaut)."""
    conn.execute("DELETE FROM accessory_overrides WHERE group_key = ?", (group_key,))
    conn.commit()


def get_ad_count(conn: sqlite3.Connection) -> int:
    """Retourne le nombre total d'annonces actives en base (hors superseded)."""
    return conn.execute("SELECT COUNT(*) FROM ads WHERE superseded_by IS NULL").fetchone()[0]
