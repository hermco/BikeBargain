# Multi-Bike Model Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate BikeBargain from a single-bike (Himalayan 450) app to a multi-brand motorcycle marketplace where each bike model has its own accessory catalog, variant detection, analyzer config, and crawler search.

**Architecture:** New `bike_model` table hierarchy stores all per-model config. Existing `Ad` and `CrawlSession` gain a `bike_model_id` FK. All API endpoints move under `/api/bike-models/{slug}/`. Frontend gets a landing page with model cards and model-scoped routing under `/models/:slug/`.

**Tech Stack:** Python 3.12, FastAPI, SQLModel, Alembic, PostgreSQL, React 19, TypeScript, TanStack Query v5, react-router-dom v6, Tailwind CSS v4

**Spec:** `docs/superpowers/specs/2026-03-28-multi-bike-model-design.md`

**Important notes:**
- No test suite exists in this project. Verification is done via manual testing and `make dev`.
- The project is written in French (comments, variable names). Keep that convention.
- All UI strings use `t()` i18n calls — never hardcode French text in components.
- After each task, run `make dev` to verify the app still works.

---

## File Structure

### New Files

| File | Purpose |
|------|---------|
| `scripts/generate_seed_data.py` | One-time script to extract current hardcoded constants to JSON seed files |
| `alembic/seed_himalayan_accessories.json` | 328 accessory patterns for Himalayan 450 |
| `alembic/seed_himalayan_data.json` | All other Himalayan seed data (variants, consumables, config, patterns, search config) |
| `alembic/versions/xxxx_add_bike_model_tables.py` | Migration 1: DDL (new tables + columns) |
| `alembic/versions/xxxx_seed_himalayan_data.py` | Migration 2: DML (seed data + constraints) |
| `frontend/src/pages/LandingPage.tsx` | Card grid of bike models |
| `frontend/src/components/ModelLayout.tsx` | Wrapper layout for model-scoped pages |
| `frontend/src/hooks/useCurrentModel.ts` | Hook providing model context from URL slug |
| `frontend/src/components/LegacyRedirect.tsx` | Handles `/ads/:id` → `/models/{slug}/ads/:id` redirect |

### Modified Files (Major Changes)

| File | Nature of Changes |
|------|-------------------|
| `src/models.py` | Add 9 new SQLModel classes, add `bike_model_id` FK to `Ad`, `CrawlSession`, change `AccessoryOverride` PK |
| `src/database.py` | Add `bike_model_id` to `_AD_FIELDS`, new CRUD functions, scope existing functions by model |
| `src/extractor.py` | Remove 4 hardcoded constants, parameterize all detection by `bike_model_id` |
| `src/accessories.py` | Remove `ACCESSORY_PATTERNS`/`EXCLUSION_PATTERNS`, load from DB |
| `src/analyzer.py` | Remove 6 constants, accept config/consumables as parameters |
| `src/crawler.py` | Remove search constants, parameterize by model's search config |
| `src/lbc_service.py` | Accept search params, return raw data only from `/fetch-ad` |
| `src/lbc_client.py` | Pass search params, simplify `fetch_ad` |
| `src/api.py` | Restructure all endpoints under `/api/bike-models/{slug}/`, add new endpoints, add backward-compat aliases |
| `main.py` | Add `--model` flag, add `import-model` command |
| `alembic/env.py` | Import new model classes |
| `frontend/src/App.tsx` | New routing structure with model-scoped routes |
| `frontend/src/lib/api.ts` | All API functions accept `slug` parameter, new model endpoints |
| `frontend/src/hooks/queries.ts` | All query keys namespaced by slug, new model hooks |
| `frontend/src/types.ts` | New `BikeModel`, `BikeVariant`, `BikeModelConfig` interfaces |
| `frontend/src/components/Layout.tsx` | Simplified for landing page only |
| `frontend/src/components/Sidebar.tsx` | Dynamic nav with model context, active model block, conditional SidebarStats |
| `frontend/src/components/FilterBar.tsx` | Fetch variants from API |
| `frontend/src/components/AdCard.tsx` | Use `useModelUrl()`, catalog-based variant colors |
| `frontend/src/components/AdForm.tsx` | Fetch variants from model context |
| `frontend/src/pages/RankingPage.tsx` | Scoped URLs, catalog-based colors |
| `frontend/src/pages/CrawlPage.tsx` | All API calls scoped by slug, scoped URLs |
| `frontend/src/pages/StatsPage.tsx` | Catalog-based chart colors |
| `frontend/src/pages/AdDetailPage.tsx` | Scoped URLs, model context for dropdowns |
| `frontend/src/pages/CatalogPage.tsx` | Per-model catalog |
| `frontend/src/pages/AdsPage.tsx` | Scoped API calls |
| `frontend/src/lib/utils.ts` | Remove `variantColor()` / `variantChartColor()` |
| `frontend/src/lib/constants.ts` | Delete file entirely |
| `frontend/src/i18n/locales/en.json` | New keys for landing page, model context, empty states |
| `frontend/src/i18n/locales/fr.json` | Same new keys in French |

---

## Task 1: Generate Seed Data from Current Constants

**Files:**
- Create: `scripts/generate_seed_data.py`
- Output: `alembic/seed_himalayan_accessories.json`, `alembic/seed_himalayan_data.json`

This script reads the current hardcoded Python constants and writes JSON files used by the Alembic migration. Run once, commit the output.

- [ ] **Step 1: Write the seed data generation script**

Create `scripts/generate_seed_data.py`:

```python
"""
Genere les fichiers JSON de seed data pour la migration multi-modele.
Lit les constantes hardcodees actuelles et les exporte en JSON.
"""

import json
import sys
from pathlib import Path

# Ajouter le repo root au path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.accessories import ACCESSORY_PATTERNS, EXCLUSION_PATTERNS
from src.extractor import NEW_PRICES, VARIANT_PATTERNS, NEW_LISTING_PATTERNS, STRONG_DEALER_PATTERNS
from src.analyzer import (
    CONSUMABLES, WARRANTY_DURATION_YEARS, WARRANTY_VALUE_PER_YEAR,
    MECHANICAL_WEAR_PER_KM, CONDITION_RISK_PER_KM, SHORT_TERM_KM_THRESHOLD,
)
from src.crawler import SEARCH_TEXT, SEARCH_CC_MIN, SEARCH_CC_MAX

ALEMBIC_DIR = Path(__file__).resolve().parent.parent / "alembic"

# Mapping variante -> couleur hex (depuis frontend/src/lib/utils.ts variantColor())
VARIANT_COLOR_HEX = {
    "Base": "#d97706",       # amber
    "Pass": "#2563eb",       # blue
    "Summit": "#059669",     # emerald
    "Mana Black": "#6b7280", # gray
}

# color_map fallback depuis extractor.py _detect_variant() lignes 134-147
COLOR_MAP_FALLBACK = [
    (r"blanc|white", "Summit", "Kamet White", "tubeless"),
    (r"noir|black", "Summit", "Hanle Black", "tubeless"),
    (r"marron|brown|kaza", "Base", "Kaza Brown", "standard"),
    (r"bleu|blue|poppy", "Pass", "Slate Poppy Blue", "standard"),
    (r"gris|sel|salt|himalayan\s*salt", "Pass", "Slate Himalayan Salt", "standard"),
]


def generate_accessories():
    """Exporte ACCESSORY_PATTERNS en JSON."""
    items = []
    for i, (regex, name, category, price, group) in enumerate(ACCESSORY_PATTERNS):
        items.append({
            "regex_pattern": regex,
            "name": name,
            "category": category,
            "new_price": price,
            "depreciation_rate": 0.65,
            "dedup_group": group if group else None,
            "sort_order": i,
        })
    return items


def generate_data():
    """Exporte tout le reste en un seul JSON."""
    # Config analyseur
    config = {
        "warranty_years": WARRANTY_DURATION_YEARS,
        "warranty_value_per_year": WARRANTY_VALUE_PER_YEAR,
        "mechanical_wear_per_km": MECHANICAL_WEAR_PER_KM,
        "condition_risk_per_km": CONDITION_RISK_PER_KM,
        "short_term_km_threshold": SHORT_TERM_KM_THRESHOLD,
    }

    # Variantes (depuis NEW_PRICES)
    variants = []
    for key, val in NEW_PRICES.items():
        variants.append({
            "variant_name": val["variant"],
            "color": val["color"],
            "wheel_type": val.get("wheel_type", "default"),
            "new_price": val["price"],
            "color_hex": VARIANT_COLOR_HEX.get(val["variant"]),
        })

    # Consommables
    consumables = []
    for c in CONSUMABLES:
        consumables.append({
            "name": c["nom"],
            "cost_eur": c["cout_garage"],
            "life_km": c["duree_vie_km"],
        })

    # Variant patterns (depuis VARIANT_PATTERNS)
    variant_patterns = []
    for i, (regex, variant, color, wheel_type) in enumerate(VARIANT_PATTERNS):
        variant_patterns.append({
            "regex_pattern": regex,
            "matched_variant": variant,
            "matched_color": color,
            "matched_wheel_type": wheel_type,
            "priority": 100 - i,  # Premier = priorite haute
        })

    # color_map fallback comme variant patterns de basse priorite
    for i, (regex, variant, color, wheel_type) in enumerate(COLOR_MAP_FALLBACK):
        variant_patterns.append({
            "regex_pattern": regex,
            "matched_variant": variant,
            "matched_color": color,
            "matched_wheel_type": wheel_type,
            "priority": 10 - i,  # Priorite basse
        })

    # New listing patterns
    new_listing_patterns = []
    for regex in NEW_LISTING_PATTERNS:
        new_listing_patterns.append({
            "regex_pattern": regex,
            "category": "model_spec" if any(k in regex for k in ["sherpa", "monocylindre", "452", "40.*cv"]) else "generic",
            "weight": 1.0,
        })
    for regex in STRONG_DEALER_PATTERNS:
        new_listing_patterns.append({
            "regex_pattern": regex,
            "category": "dealer",
            "weight": 2.0,
        })

    # Exclusion patterns
    exclusion_patterns = [{"regex_pattern": p} for p in EXCLUSION_PATTERNS]

    # Search config
    search_configs = [{
        "keyword": SEARCH_TEXT,
        "min_cc": SEARCH_CC_MIN,
        "max_cc": SEARCH_CC_MAX,
    }]

    return {
        "config": config,
        "variants": variants,
        "consumables": consumables,
        "variant_patterns": variant_patterns,
        "new_listing_patterns": new_listing_patterns,
        "exclusion_patterns": exclusion_patterns,
        "search_configs": search_configs,
    }


if __name__ == "__main__":
    accessories = generate_accessories()
    with open(ALEMBIC_DIR / "seed_himalayan_accessories.json", "w") as f:
        json.dump(accessories, f, indent=2, ensure_ascii=False)
    print(f"Ecrit {len(accessories)} accessory patterns")

    data = generate_data()
    with open(ALEMBIC_DIR / "seed_himalayan_data.json", "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Ecrit seed data: {len(data['variants'])} variantes, "
          f"{len(data['consumables'])} consommables, "
          f"{len(data['variant_patterns'])} variant patterns, "
          f"{len(data['new_listing_patterns'])} new listing patterns, "
          f"{len(data['exclusion_patterns'])} exclusion patterns, "
          f"{len(data['search_configs'])} search configs")
```

**Note:** The `COLOR_MAP_FALLBACK` regexes and mappings must be extracted manually from `src/extractor.py:134-147` since they are inline code, not a constant. Verify the exact patterns by reading the source.

- [ ] **Step 2: Run the script**

```bash
source .venv/bin/activate
python scripts/generate_seed_data.py
```

Expected: Two JSON files created in `alembic/`. Verify the accessory JSON has ~80+ entries (the actual count of unique patterns) and the data JSON has 7 variants, 4 consumables, 6+ variant patterns.

- [ ] **Step 3: Spot-check the generated JSON**

Open `alembic/seed_himalayan_accessories.json` and verify:
- First entry matches the first pattern in `ACCESSORY_PATTERNS`
- `sort_order` increments from 0
- All `depreciation_rate` values are 0.65
- `dedup_group` is null where the source has empty string or None

Open `alembic/seed_himalayan_data.json` and verify:
- `config.warranty_years` = 3
- 7 variants with correct prices (5890 for Base Kaza Brown, 6590 for Mana Black)
- `color_hex` values are present for each variant
- Variant patterns have priorities from high (100) to low (10)

- [ ] **Step 4: Commit**

```bash
git add scripts/generate_seed_data.py alembic/seed_himalayan_accessories.json alembic/seed_himalayan_data.json
git commit -m "feat: add seed data generation script for multi-bike migration"
```

---

## Task 2: Add New SQLModel Classes

**Files:**
- Modify: `src/models.py`

Add all new bike model tables. Keep existing models unchanged — we'll add the FK columns in the migration task.

- [ ] **Step 1: Add the new model classes to `src/models.py`**

Add the following classes after the existing `AccessoryOverride` class (after line 176). Add the needed imports first:

Add to the imports at line 6:
```python
from sqlalchemy import UniqueConstraint, Column, BigInteger, Integer, Float, ForeignKey, PrimaryKeyConstraint, String
```

Then add the new classes:

```python
# ─── Bike Models ────────────────────────────────────────────────────────────

class BikeModel(SQLModel, table=True):
    __tablename__ = "bike_models"

    id: int | None = Field(default=None, primary_key=True)
    slug: str = Field(unique=True, index=True)
    brand: str
    name: str
    engine_cc: int
    image_url: str | None = None
    active: bool = Field(default=True)
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())

    config: "BikeModelConfig | None" = Relationship(back_populates="bike_model")
    variants: list["BikeVariant"] = Relationship(back_populates="bike_model")
    consumables: list["BikeConsumable"] = Relationship(back_populates="bike_model")
    accessory_patterns: list["BikeAccessoryPattern"] = Relationship(back_populates="bike_model")
    variant_patterns: list["BikeVariantPattern"] = Relationship(back_populates="bike_model")
    new_listing_patterns: list["BikeNewListingPattern"] = Relationship(back_populates="bike_model")
    exclusion_patterns: list["BikeExclusionPattern"] = Relationship(back_populates="bike_model")
    search_configs: list["BikeSearchConfig"] = Relationship(back_populates="bike_model")


class BikeModelConfig(SQLModel, table=True):
    __tablename__ = "bike_model_configs"

    id: int | None = Field(default=None, primary_key=True)
    bike_model_id: int = Field(
        sa_column=Column(Integer, ForeignKey("bike_models.id", ondelete="CASCADE"), nullable=False, unique=True),
    )
    warranty_years: int
    warranty_value_per_year: int
    mechanical_wear_per_km: float
    condition_risk_per_km: float
    short_term_km_threshold: int

    bike_model: BikeModel | None = Relationship(back_populates="config")


class BikeVariant(SQLModel, table=True):
    __tablename__ = "bike_variants"
    __table_args__ = (UniqueConstraint("bike_model_id", "variant_name", "color", "wheel_type"),)

    id: int | None = Field(default=None, primary_key=True)
    bike_model_id: int = Field(
        sa_column=Column(Integer, ForeignKey("bike_models.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    variant_name: str
    color: str
    wheel_type: str = Field(default="default")
    new_price: int
    color_hex: str | None = None

    bike_model: BikeModel | None = Relationship(back_populates="variants")


class BikeConsumable(SQLModel, table=True):
    __tablename__ = "bike_consumables"

    id: int | None = Field(default=None, primary_key=True)
    bike_model_id: int = Field(
        sa_column=Column(Integer, ForeignKey("bike_models.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    name: str
    cost_eur: int
    life_km: int

    bike_model: BikeModel | None = Relationship(back_populates="consumables")


class BikeAccessoryPattern(SQLModel, table=True):
    __tablename__ = "bike_accessory_patterns"

    id: int | None = Field(default=None, primary_key=True)
    bike_model_id: int = Field(
        sa_column=Column(Integer, ForeignKey("bike_models.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    regex_pattern: str
    name: str
    category: str
    new_price: int
    depreciation_rate: float = Field(default=0.65)
    dedup_group: str | None = None
    sort_order: int = Field(default=0)

    bike_model: BikeModel | None = Relationship(back_populates="accessory_patterns")


class BikeVariantPattern(SQLModel, table=True):
    __tablename__ = "bike_variant_patterns"

    id: int | None = Field(default=None, primary_key=True)
    bike_model_id: int = Field(
        sa_column=Column(Integer, ForeignKey("bike_models.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    regex_pattern: str
    matched_variant: str
    matched_color: str | None = None
    matched_wheel_type: str | None = None
    priority: int = Field(default=0)

    bike_model: BikeModel | None = Relationship(back_populates="variant_patterns")


class BikeNewListingPattern(SQLModel, table=True):
    __tablename__ = "bike_new_listing_patterns"

    id: int | None = Field(default=None, primary_key=True)
    bike_model_id: int = Field(
        sa_column=Column(Integer, ForeignKey("bike_models.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    regex_pattern: str
    category: str  # "model_spec", "dealer", "generic"
    weight: float = Field(default=1.0)

    bike_model: BikeModel | None = Relationship(back_populates="new_listing_patterns")


class BikeExclusionPattern(SQLModel, table=True):
    __tablename__ = "bike_exclusion_patterns"

    id: int | None = Field(default=None, primary_key=True)
    bike_model_id: int = Field(
        sa_column=Column(Integer, ForeignKey("bike_models.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    regex_pattern: str

    bike_model: BikeModel | None = Relationship(back_populates="exclusion_patterns")


class BikeSearchConfig(SQLModel, table=True):
    __tablename__ = "bike_search_configs"

    id: int | None = Field(default=None, primary_key=True)
    bike_model_id: int = Field(
        sa_column=Column(Integer, ForeignKey("bike_models.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    keyword: str
    min_cc: int | None = None
    max_cc: int | None = None

    bike_model: BikeModel | None = Relationship(back_populates="search_configs")
```

- [ ] **Step 2: Add `bike_model_id` FK to existing models**

Add to the `Ad` class (after `superseded_by` field, line 47):
```python
    bike_model_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("bike_models.id"), index=True))
```

Add to the `CrawlSession` class (after `created_at` field, line 121):
```python
    bike_model_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("bike_models.id"), index=True))
```

Change `AccessoryOverride` class (lines 172-176) to use composite PK:
```python
class AccessoryOverride(SQLModel, table=True):
    __tablename__ = "accessory_overrides"
    __table_args__ = (PrimaryKeyConstraint("bike_model_id", "group_key"),)

    bike_model_id: int = Field(default=0)
    group_key: str
    estimated_new_price: int
```

- [ ] **Step 3: Update `alembic/env.py` imports**

Replace the import block (lines 9-12):
```python
from src.models import (  # noqa: F401
    Ad, AdAttribute, AdImage, AdAccessory,
    CrawlSession, CrawlSessionAd, AdPriceHistory, AccessoryOverride,
    BikeModel, BikeModelConfig, BikeVariant, BikeConsumable,
    BikeAccessoryPattern, BikeVariantPattern, BikeNewListingPattern,
    BikeExclusionPattern, BikeSearchConfig,
)
```

- [ ] **Step 4: Commit**

```bash
git add src/models.py alembic/env.py
git commit -m "feat: add SQLModel classes for multi-bike model tables"
```

---

## Task 3: Alembic Migrations

**Files:**
- Create: `alembic/versions/xxxx_add_bike_model_tables.py` (Migration 1: DDL)
- Create: `alembic/versions/xxxx_seed_himalayan_data.py` (Migration 2: DML)

- [ ] **Step 1: Generate Migration 1 (DDL) via autogenerate**

```bash
source .venv/bin/activate
alembic revision --autogenerate -m "add bike model tables and bike_model_id columns"
```

Review the generated migration. It should contain:
- `CREATE TABLE` for all 9 new tables
- `ADD COLUMN bike_model_id` on `ads`, `crawl_sessions`
- PK change on `accessory_overrides`

If the autogenerate doesn't correctly handle the `accessory_overrides` PK change (SQLModel composite PKs can be tricky), manually add the operations:
```python
op.drop_constraint('accessory_overrides_pkey', 'accessory_overrides', type_='primary')
op.add_column('accessory_overrides', sa.Column('bike_model_id', sa.Integer(), nullable=True))
op.create_primary_key('accessory_overrides_pkey', 'accessory_overrides', ['bike_model_id', 'group_key'])
```

The `downgrade()` must reverse everything.

- [ ] **Step 2: Write Migration 2 (DML) — seed data + constraints**

```bash
alembic revision -m "seed himalayan 450 data and add constraints"
```

Write the migration manually. The `upgrade()` function should:

```python
import json
from pathlib import Path
from alembic import op
import sqlalchemy as sa

ALEMBIC_DIR = Path(__file__).resolve().parent.parent


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Insert Himalayan 450 bike model
    conn.execute(sa.text("""
        INSERT INTO bike_models (id, slug, brand, name, engine_cc, active, created_at)
        VALUES (1, 'himalayan-450', 'Royal Enfield', 'Himalayan 450', 452, true, NOW())
    """))

    # 2. Load and insert seed data
    with open(ALEMBIC_DIR / "seed_himalayan_data.json") as f:
        data = json.load(f)

    # Config
    cfg = data["config"]
    conn.execute(sa.text("""
        INSERT INTO bike_model_configs (bike_model_id, warranty_years, warranty_value_per_year,
            mechanical_wear_per_km, condition_risk_per_km, short_term_km_threshold)
        VALUES (1, :wy, :wv, :mw, :cr, :st)
    """), {"wy": cfg["warranty_years"], "wv": cfg["warranty_value_per_year"],
           "mw": cfg["mechanical_wear_per_km"], "cr": cfg["condition_risk_per_km"],
           "st": cfg["short_term_km_threshold"]})

    # Variants
    for v in data["variants"]:
        conn.execute(sa.text("""
            INSERT INTO bike_variants (bike_model_id, variant_name, color, wheel_type, new_price, color_hex)
            VALUES (1, :vn, :c, :wt, :np, :ch)
        """), {"vn": v["variant_name"], "c": v["color"], "wt": v["wheel_type"],
               "np": v["new_price"], "ch": v.get("color_hex")})

    # Consumables
    for c in data["consumables"]:
        conn.execute(sa.text("""
            INSERT INTO bike_consumables (bike_model_id, name, cost_eur, life_km)
            VALUES (1, :n, :ce, :lk)
        """), {"n": c["name"], "ce": c["cost_eur"], "lk": c["life_km"]})

    # Variant patterns
    for p in data["variant_patterns"]:
        conn.execute(sa.text("""
            INSERT INTO bike_variant_patterns (bike_model_id, regex_pattern, matched_variant,
                matched_color, matched_wheel_type, priority)
            VALUES (1, :rp, :mv, :mc, :mwt, :pr)
        """), {"rp": p["regex_pattern"], "mv": p["matched_variant"],
               "mc": p.get("matched_color"), "mwt": p.get("matched_wheel_type"),
               "pr": p["priority"]})

    # New listing patterns
    for p in data["new_listing_patterns"]:
        conn.execute(sa.text("""
            INSERT INTO bike_new_listing_patterns (bike_model_id, regex_pattern, category, weight)
            VALUES (1, :rp, :cat, :w)
        """), {"rp": p["regex_pattern"], "cat": p["category"], "w": p["weight"]})

    # Exclusion patterns
    for p in data["exclusion_patterns"]:
        conn.execute(sa.text("""
            INSERT INTO bike_exclusion_patterns (bike_model_id, regex_pattern)
            VALUES (1, :rp)
        """), {"rp": p["regex_pattern"]})

    # Search configs
    for sc in data["search_configs"]:
        conn.execute(sa.text("""
            INSERT INTO bike_search_configs (bike_model_id, keyword, min_cc, max_cc)
            VALUES (1, :kw, :mincc, :maxcc)
        """), {"kw": sc["keyword"], "mincc": sc.get("min_cc"), "maxcc": sc.get("max_cc")})

    # 3. Load and insert accessory patterns
    with open(ALEMBIC_DIR / "seed_himalayan_accessories.json") as f:
        accessories = json.load(f)

    for acc in accessories:
        conn.execute(sa.text("""
            INSERT INTO bike_accessory_patterns (bike_model_id, regex_pattern, name, category,
                new_price, depreciation_rate, dedup_group, sort_order)
            VALUES (1, :rp, :n, :cat, :np, :dr, :dg, :so)
        """), {"rp": acc["regex_pattern"], "n": acc["name"], "cat": acc["category"],
               "np": acc["new_price"], "dr": acc["depreciation_rate"],
               "dg": acc.get("dedup_group"), "so": acc["sort_order"]})

    # 4. Backfill bike_model_id on existing data
    conn.execute(sa.text("UPDATE ads SET bike_model_id = 1 WHERE bike_model_id IS NULL"))
    conn.execute(sa.text("UPDATE crawl_sessions SET bike_model_id = 1 WHERE bike_model_id IS NULL"))
    conn.execute(sa.text("UPDATE accessory_overrides SET bike_model_id = 1 WHERE bike_model_id = 0"))

    # 5. Add NOT NULL constraints and FK
    op.alter_column('ads', 'bike_model_id', nullable=False)
    op.alter_column('crawl_sessions', 'bike_model_id', nullable=False)
    op.create_foreign_key('fk_ads_bike_model', 'ads', 'bike_models', ['bike_model_id'], ['id'])
    op.create_foreign_key('fk_crawl_sessions_bike_model', 'crawl_sessions', 'bike_models', ['bike_model_id'], ['id'])
    op.create_foreign_key('fk_accessory_overrides_bike_model', 'accessory_overrides', 'bike_models', ['bike_model_id'], ['id'])

    # 6. Add indexes
    op.create_index('ix_ads_bike_model_variant', 'ads', ['bike_model_id', 'variant'])
    op.create_index('ix_ads_bike_model_price', 'ads', ['bike_model_id', 'price'])
    op.create_index('ix_crawl_sessions_bike_model_status', 'crawl_sessions', ['bike_model_id', 'status'])


def downgrade() -> None:
    op.drop_index('ix_crawl_sessions_bike_model_status')
    op.drop_index('ix_ads_bike_model_price')
    op.drop_index('ix_ads_bike_model_variant')
    op.drop_constraint('fk_accessory_overrides_bike_model', 'accessory_overrides', type_='foreignkey')
    op.drop_constraint('fk_crawl_sessions_bike_model', 'crawl_sessions', type_='foreignkey')
    op.drop_constraint('fk_ads_bike_model', 'ads', type_='foreignkey')
    op.alter_column('crawl_sessions', 'bike_model_id', nullable=True)
    op.alter_column('ads', 'bike_model_id', nullable=True)

    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM bike_accessory_patterns WHERE bike_model_id = 1"))
    conn.execute(sa.text("DELETE FROM bike_search_configs WHERE bike_model_id = 1"))
    conn.execute(sa.text("DELETE FROM bike_exclusion_patterns WHERE bike_model_id = 1"))
    conn.execute(sa.text("DELETE FROM bike_new_listing_patterns WHERE bike_model_id = 1"))
    conn.execute(sa.text("DELETE FROM bike_variant_patterns WHERE bike_model_id = 1"))
    conn.execute(sa.text("DELETE FROM bike_consumables WHERE bike_model_id = 1"))
    conn.execute(sa.text("DELETE FROM bike_variants WHERE bike_model_id = 1"))
    conn.execute(sa.text("DELETE FROM bike_model_configs WHERE bike_model_id = 1"))
    conn.execute(sa.text("DELETE FROM bike_models WHERE id = 1"))
```

- [ ] **Step 3: Run migrations**

```bash
make db  # Ensure PostgreSQL is running
alembic upgrade head
```

Expected: Both migrations apply successfully. Verify with:
```bash
alembic current
```

- [ ] **Step 4: Verify seed data**

```bash
python -c "
from src.database import get_session
from src.models import BikeModel, BikeAccessoryPattern, BikeVariant
from sqlmodel import select
with next(get_session()) as s:
    m = s.exec(select(BikeModel)).first()
    print(f'Model: {m.slug}, {m.brand} {m.name}')
    acc_count = len(s.exec(select(BikeAccessoryPattern).where(BikeAccessoryPattern.bike_model_id == 1)).all())
    var_count = len(s.exec(select(BikeVariant).where(BikeVariant.bike_model_id == 1)).all())
    print(f'Accessories: {acc_count}, Variants: {var_count}')
"
```

Expected: `Model: himalayan-450, Royal Enfield Himalayan 450`, correct counts.

- [ ] **Step 5: Commit**

```bash
git add alembic/versions/
git commit -m "feat: add Alembic migrations for multi-bike model (DDL + seed data)"
```

---

## Task 4: Database CRUD Functions

**Files:**
- Modify: `src/database.py`

Add CRUD functions for bike models. Update existing functions to scope by `bike_model_id`.

- [ ] **Step 1: Add `bike_model_id` to `_AD_FIELDS` and add new imports**

Add `"bike_model_id"` to the `_AD_FIELDS` list. Add imports for new models at the top of the file.

- [ ] **Step 2: Add bike model CRUD functions**

Add these functions to `src/database.py`:

```python
def get_bike_models(session: Session) -> list[BikeModel]:
    """Retourne tous les modeles actifs."""
    return list(session.exec(
        select(BikeModel).where(BikeModel.active == True).order_by(BikeModel.name)
    ).all())


def get_bike_model_by_slug(session: Session, slug: str) -> BikeModel | None:
    """Retourne un modele par son slug."""
    return session.exec(select(BikeModel).where(BikeModel.slug == slug)).first()


def get_bike_model_config(session: Session, bike_model_id: int) -> BikeModelConfig | None:
    """Retourne la config analyseur d'un modele."""
    return session.exec(
        select(BikeModelConfig).where(BikeModelConfig.bike_model_id == bike_model_id)
    ).first()


def get_bike_variants(session: Session, bike_model_id: int) -> list[BikeVariant]:
    """Retourne les variantes d'un modele."""
    return list(session.exec(
        select(BikeVariant).where(BikeVariant.bike_model_id == bike_model_id)
    ).all())


def get_bike_consumables(session: Session, bike_model_id: int) -> list[BikeConsumable]:
    """Retourne les consommables d'un modele."""
    return list(session.exec(
        select(BikeConsumable).where(BikeConsumable.bike_model_id == bike_model_id)
    ).all())


def get_accessory_patterns(session: Session, bike_model_id: int) -> list[BikeAccessoryPattern]:
    """Retourne les patterns d'accessoires d'un modele, ordonnes par sort_order."""
    return list(session.exec(
        select(BikeAccessoryPattern)
        .where(BikeAccessoryPattern.bike_model_id == bike_model_id)
        .order_by(BikeAccessoryPattern.sort_order)
    ).all())


def get_variant_patterns(session: Session, bike_model_id: int) -> list[BikeVariantPattern]:
    """Retourne les patterns de detection de variante, ordonnes par priorite desc."""
    return list(session.exec(
        select(BikeVariantPattern)
        .where(BikeVariantPattern.bike_model_id == bike_model_id)
        .order_by(BikeVariantPattern.priority.desc())
    ).all())


def get_exclusion_patterns(session: Session, bike_model_id: int) -> list[BikeExclusionPattern]:
    """Retourne les patterns d'exclusion d'un modele."""
    return list(session.exec(
        select(BikeExclusionPattern)
        .where(BikeExclusionPattern.bike_model_id == bike_model_id)
    ).all())


def get_new_listing_patterns(session: Session, bike_model_id: int) -> list[BikeNewListingPattern]:
    """Retourne les patterns de detection de nouvelles annonces."""
    return list(session.exec(
        select(BikeNewListingPattern)
        .where(BikeNewListingPattern.bike_model_id == bike_model_id)
    ).all())


def get_search_configs(session: Session, bike_model_id: int) -> list[BikeSearchConfig]:
    """Retourne les configs de recherche d'un modele."""
    return list(session.exec(
        select(BikeSearchConfig)
        .where(BikeSearchConfig.bike_model_id == bike_model_id)
    ).all())
```

- [ ] **Step 3: Update `get_accessory_overrides` and `set_accessory_override` to scope by model**

Update `get_accessory_overrides` to accept `bike_model_id`:
```python
def get_accessory_overrides(session: Session, bike_model_id: int) -> dict[str, int]:
    overrides = session.exec(
        select(AccessoryOverride).where(AccessoryOverride.bike_model_id == bike_model_id)
    ).all()
    return {o.group_key: o.estimated_new_price for o in overrides}
```

Update `set_accessory_override` to use composite PK:
```python
def set_accessory_override(session: Session, bike_model_id: int, group_key: str, estimated_new_price: int) -> None:
    existing = session.get(AccessoryOverride, (bike_model_id, group_key))
    if existing:
        existing.estimated_new_price = estimated_new_price
    else:
        session.add(AccessoryOverride(bike_model_id=bike_model_id, group_key=group_key, estimated_new_price=estimated_new_price))
    session.commit()
```

Update `delete_accessory_override` similarly:
```python
def delete_accessory_override(session: Session, bike_model_id: int, group_key: str) -> bool:
    existing = session.get(AccessoryOverride, (bike_model_id, group_key))
    if existing:
        session.delete(existing)
        session.commit()
        return True
    return False
```

- [ ] **Step 4: Update `refresh_accessories` to scope by model**

The `refresh_accessories` function must accept `bike_model_id`, load patterns once, and pass them to detection calls. This will be fully refactored in Task 6 when `detect_accessories` is updated. For now, add `bike_model_id` as a parameter and pass it through.

- [ ] **Step 5: Commit**

```bash
git add src/database.py
git commit -m "feat: add bike model CRUD functions and scope overrides by model"
```

---

## Task 5: LBC Service + Client Refactor

**Files:**
- Modify: `src/lbc_service.py`
- Modify: `src/lbc_client.py`

The LBC service becomes raw scraping only. Search accepts parameters. `/fetch-ad` returns raw data without business logic (no accessory/variant detection).

- [ ] **Step 1: Update `lbc_service.py` search endpoint to accept params**

Add a request model and update the search endpoint:

```python
class SearchRequest(BaseModel):
    keyword: str = "Himalayan"
    min_cc: int | None = None
    max_cc: int | None = None
```

Update the search endpoint:
```python
@app.post("/search")
def search(req: SearchRequest):
    """Lance la recherche LeBonCoin avec les parametres fournis."""
    from .crawler import search_all_ads
    try:
        return search_all_ads(keyword=req.keyword, min_cc=req.min_cc, max_cc=req.max_cc)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur recherche LeBonCoin : {e}")
```

- [ ] **Step 2: Update `lbc_service.py` `/fetch-ad` to return raw data**

The `/fetch-ad` endpoint currently calls `fetch_ad()` which runs variant detection and accessory detection. Change it to only do raw LBC scraping — return the raw ad data dict without running detection. The caller (API layer) will handle detection.

This requires either:
- Creating a new `fetch_ad_raw()` function in `extractor.py` that does extraction without detection
- Or passing a flag to `fetch_ad()` to skip detection

The cleanest approach is to extract the raw scraping part. We'll do this in Task 6 when refactoring `extractor.py`. For now, add a `raw=True` parameter.

- [ ] **Step 3: Update `lbc_client.py` to pass search params**

```python
def search(keyword: str = "Himalayan", min_cc: int | None = None, max_cc: int | None = None) -> dict:
    """Lance la recherche LeBonCoin via le service local."""
    payload = {"keyword": keyword, "min_cc": min_cc, "max_cc": max_cc}
    r = httpx.post(f"{_base_url()}/search", json=payload, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()
```

Update `fetch_ad` to not pass `price_overrides` (detection moves to API):
```python
def fetch_ad(url: str) -> dict:
    """Extrait les donnees brutes d'une annonce via le service local."""
    r = httpx.post(f"{_base_url()}/fetch-ad", json={"url": url}, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()
```

- [ ] **Step 4: Commit**

```bash
git add src/lbc_service.py src/lbc_client.py
git commit -m "feat: parameterize LBC service search, simplify fetch-ad to raw scraping"
```

---

## Task 6: Backend Business Logic Refactor

**Files:**
- Modify: `src/extractor.py`
- Modify: `src/accessories.py`
- Modify: `src/analyzer.py`
- Modify: `src/crawler.py`

This is the largest single task. All hardcoded constants are removed and replaced with DB-loaded data.

- [ ] **Step 1: Refactor `src/accessories.py`**

Remove `ACCESSORY_PATTERNS` (lines 37-328), `EXCLUSION_PATTERNS` (lines 335-342), and `DEPRECIATION_RATE` (line 24).

Update `detect_accessories` signature:
```python
def detect_accessories(
    text: str,
    bike_model_id: int,
    session,
    *,
    patterns: list | None = None,
    exclusions: list | None = None,
    price_overrides: dict[str, int] | None = None,
) -> list[dict]:
```

Inside the function:
- If `patterns` is None, load from DB: `patterns = get_accessory_patterns(session, bike_model_id)`
- If `exclusions` is None, load from DB: `exclusions = get_exclusion_patterns(session, bike_model_id)`
- Replace `DEPRECIATION_RATE` usage with `pattern.depreciation_rate` from each pattern
- The regex matching and dedup logic stays the same, just iterate over DB-loaded patterns instead of the constant

Update `estimate_total_accessories_value` similarly to accept patterns from DB.

- [ ] **Step 2: Refactor `src/extractor.py`**

Remove constants: `NEW_PRICES` (lines 36-44), `VARIANT_PATTERNS` (lines 47-54), `NEW_LISTING_PATTERNS` (lines 183-196), `STRONG_DEALER_PATTERNS` (lines 200-206).

Update `_detect_variant`:
```python
def _detect_variant(subject: str, body: str, attributes: dict,
                    bike_model_id: int, session) -> tuple[str | None, str | None, str | None]:
    """Detecte variante, couleur et type de roue depuis le texte de l'annonce."""
    from .database import get_variant_patterns
    patterns = get_variant_patterns(session, bike_model_id)

    # Check LBC attribute first
    version = _get_attr_label(attributes, "version")
    combined = f"{subject} {body} {version or ''}"

    for p in patterns:  # Already sorted by priority desc
        if re.search(p.regex_pattern, combined, re.IGNORECASE):
            return (p.matched_variant, p.matched_color, p.matched_wheel_type)

    return (None, None, None)
```

Remove the `color_map` fallback block entirely — those mappings are now low-priority entries in `bike_variant_patterns`.

Update `_estimate_new_price`:
```python
def _estimate_new_price(bike_model_id: int, variant: str | None, color: str | None,
                        wheel_type: str | None, session) -> float | None:
    from .database import get_bike_variants
    variants = get_bike_variants(session, bike_model_id)
    wt = wheel_type or "default"
    # Exact match
    for v in variants:
        if v.variant_name == variant and v.color == color and v.wheel_type == wt:
            return v.new_price
    # Variant-only fallback
    for v in variants:
        if v.variant_name == variant:
            return v.new_price
    return None
```

Update `detect_new_listing` to accept `bike_model_id` + `session` and load patterns from DB.

Update `detect_new_listing_light` signature:
```python
def detect_new_listing_light(subject: str, price: float | None,
                             seller_type: str | None, catalog_prices: list[int]) -> bool:
```
Replace hardcoded `NEW_PRICES` price lookup with the `catalog_prices` parameter.

Update `fetch_ad` to accept `bike_model_id` and `session`:
```python
def fetch_ad(url: str, bike_model_id: int, session, *, client=None, price_overrides=None) -> dict:
```
Inside, call `_detect_variant(subject, body, attributes, bike_model_id, session)` and `_estimate_new_price(bike_model_id, ...)`.

- [ ] **Step 3: Refactor `src/analyzer.py`**

Remove all constants (lines 21-61).

Update `compute_consumable_wear`:
```python
def compute_consumable_wear(mileage_km: int, consumables: list) -> dict:
    """Calcule l'usure des consommables. Accepte une liste de BikeConsumable."""
    # Same logic, iterate over consumables parameter instead of CONSUMABLES constant
    # Use c.cost_eur and c.life_km instead of c["cout_garage"] and c["duree_vie_km"]
```

Update `compute_warranty`:
```python
def compute_warranty(year: int | None, pub_date_str: str | None, config, today=None) -> dict:
    """Calcule la valeur de garantie. Accepte un BikeModelConfig."""
    # Use config.warranty_years and config.warranty_value_per_year
```

Update `rank_ads`:
```python
def rank_ads(bike_model_id: int, session, today=None) -> list[dict]:
    """Classe les annonces d'un modele."""
    from .database import get_bike_model_config, get_bike_consumables
    config = get_bike_model_config(session, bike_model_id)
    consumables = get_bike_consumables(session, bike_model_id)

    ads = session.exec(select(Ad).where(Ad.bike_model_id == bike_model_id)).all()
    # Use config.mechanical_wear_per_km, config.condition_risk_per_km, config.short_term_km_threshold
    # Pass consumables to compute_consumable_wear
    # Pass config to compute_warranty
```

- [ ] **Step 4: Refactor `src/crawler.py`**

Remove constants (lines 18-21).

Update `search_all_ads` to accept search parameters:
```python
def search_all_ads(keyword: str = "Himalayan", min_cc: int | None = None,
                   max_cc: int | None = None) -> dict:
```

Inside, use the parameters instead of `SEARCH_TEXT`, `SEARCH_CC_MIN`, `SEARCH_CC_MAX`. When `min_cc` is None, don't set the CC filter on the LBC search.

- [ ] **Step 5: Verify the app still starts**

```bash
make dev
```

The app should start without import errors. Existing functionality may not work yet until the API layer is updated (Task 7).

- [ ] **Step 6: Commit**

```bash
git add src/extractor.py src/accessories.py src/analyzer.py src/crawler.py
git commit -m "feat: parameterize backend by bike_model_id, remove hardcoded constants"
```

---

## Task 7: API Endpoints Refactor

**Files:**
- Modify: `src/api.py`

This is the most complex task. All endpoints move under `/api/bike-models/{slug}/`. Backward-compatible aliases are added. New endpoints for model management.

This task is large. Break it into sub-steps per endpoint group.

- [ ] **Step 1: Add shared dependency and new schemas**

Add to `src/api.py`:

```python
from .models import BikeModel, BikeModelConfig, BikeVariant, BikeAccessoryPattern
from .database import get_bike_model_by_slug, get_bike_models, get_bike_variants, get_accessory_patterns, get_search_configs, get_variant_patterns

def resolve_bike_model(slug: str, session: Session = Depends(get_session)) -> BikeModel:
    """Dependency FastAPI qui resout le slug en BikeModel."""
    model = get_bike_model_by_slug(session, slug)
    if not model:
        raise HTTPException(status_code=404, detail=f"Modele '{slug}' non trouve")
    return model
```

- [ ] **Step 2: Add bike model listing and detail endpoints**

```python
@app.get("/api/bike-models")
def list_bike_models(session: Session = Depends(get_session)):
    """Liste les modeles actifs avec stats resumees pour la landing page."""
    models = get_bike_models(session)
    result = []
    for m in models:
        stats = session.exec(sa.text("""
            SELECT COUNT(*) as count, MIN(price) as min_price, MAX(price) as max_price
            FROM ads WHERE bike_model_id = :mid AND sold = 0
        """), {"mid": m.id}).first()
        result.append({
            "id": m.id, "slug": m.slug, "brand": m.brand, "name": m.name,
            "engine_cc": m.engine_cc, "image_url": m.image_url,
            "ad_count": stats.count, "min_price": stats.min_price, "max_price": stats.max_price,
        })
    return result


@app.get("/api/bike-models/{slug}")
def get_bike_model(slug: str, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)
    config = get_bike_model_config(session, model.id)
    return {"model": model, "config": config}


@app.get("/api/bike-models/{slug}/variants")
def list_variants(slug: str, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)
    return get_bike_variants(session, model.id)
```

- [ ] **Step 3: Move all existing endpoints under `/api/bike-models/{slug}/`**

For each existing endpoint, create a new route under the model namespace. The function resolves the slug to `bike_model_id` and injects it where needed.

Example pattern for `list_ads`:
```python
@app.get("/api/bike-models/{slug}/ads")
def list_ads_scoped(slug: str, variant: str | None = None, ...same params...,
                    session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)
    # Same logic as current list_ads, but add:
    # conditions.append(Ad.bike_model_id == model.id)
```

Apply the same pattern to ALL endpoints listed in the spec's "Modified Endpoints" table. Key changes per endpoint:

- **`confirm_ad`**: Inject `bike_model_id` into `ad_data` before calling `upsert_ad`. Call `_estimate_new_price(model.id, ...)`.
- **`update_ad`**: Same — use `model.id` for `_estimate_new_price`.
- **`merge_ad`**: Same.
- **`preview_ad`**: Call `fetch_ad(url, model.id, session)`.
- **`get_stats`**: Filter ads by `bike_model_id`.
- **`get_rankings`**: Call `rank_ads(model.id, session)`.
- **`get_accessory_catalog`**: Load from `BikeAccessoryPattern` filtered by model.
- **`update_catalog_price` / `reset_catalog_price`**: Scope overrides by model.
- **`check_ads_online`**: Filter `Ad.bike_model_id == model.id`.
- **`check_prices`**: Load search config from model, pass to search.
- **`crawl_search`**: Load search configs for model, call `search_all_ads` per keyword. Close only model's active sessions.
- **`refresh_all_accessories`**: Load patterns once, pass to `detect_accessories` calls. Scope to model.

- [ ] **Step 4: Update `_find_potential_duplicates` to scope by model**

Add `bike_model_id` parameter and filter the SQL query:
```python
conditions.append(Ad.bike_model_id == bike_model_id)
```

- [ ] **Step 5: Update `_extract_significant_words` stopwords**

Load the model's brand and name dynamically:
```python
def _extract_significant_words(text: str, model_brand: str = "", model_name: str = "") -> set[str]:
    stopwords = {"de", "le", "la", "les", "un", "une", "des", ...}
    # Add model-specific stopwords
    for word in f"{model_brand} {model_name}".lower().split():
        stopwords.add(word)
```

- [ ] **Step 6: Add backward-compatible route aliases**

For each old route, add an alias that resolves to the single model:

```python
@app.get("/api/ads")
def list_ads_compat(session: Session = Depends(get_session), **params):
    """Alias backward-compatible. Fonctionne uniquement avec un seul modele."""
    models = get_bike_models(session)
    if len(models) != 1:
        raise HTTPException(400, "Multiple modeles existent. Utilisez /api/bike-models/{slug}/ads")
    return list_ads_scoped(models[0].slug, session=session, **params)
```

Apply for all old routes.

- [ ] **Step 7: Add `GET /api/ads/{id}/model-slug` for legacy redirect**

```python
@app.get("/api/ads/{ad_id}/model-slug")
def get_ad_model_slug(ad_id: int, session: Session = Depends(get_session)):
    ad = session.get(Ad, ad_id)
    if not ad:
        raise HTTPException(404)
    model = session.get(BikeModel, ad.bike_model_id)
    return {"slug": model.slug}
```

- [ ] **Step 8: Add admin endpoints (model import, clone)**

Add `POST /api/bike-models/import` and `POST /api/bike-models/{slug}/clone` as described in spec. These accept JSON payloads and create all related records in one transaction.

- [ ] **Step 9: Verify with `make dev`**

Start the app and test:
- `curl http://localhost:8000/api/bike-models` should return the Himalayan 450
- `curl http://localhost:8000/api/bike-models/himalayan-450/ads` should return existing ads
- `curl http://localhost:8000/api/ads` (old route) should still work (backward compat)

- [ ] **Step 10: Commit**

```bash
git add src/api.py
git commit -m "feat: restructure API under /api/bike-models/{slug}/, add model endpoints"
```

---

## Task 8: CLI Refactor

**Files:**
- Modify: `main.py`

- [ ] **Step 1: Add `--model` flag to argparse**

Add a global `--model` / `-m` argument to the main parser. Add logic to resolve the model slug.

- [ ] **Step 2: Update all command handlers**

Each command handler must resolve `bike_model_id` from the `--model` flag (or auto-detect if single model). Pass it to `fetch_ad`, `_estimate_new_price`, `rank_ads`, etc.

- [ ] **Step 3: Add `import-model` command**

Add a new subcommand that reads a JSON file and calls the import API or directly inserts into DB.

- [ ] **Step 4: Commit**

```bash
git add main.py
git commit -m "feat: add --model flag to CLI commands"
```

---

## Task 9: Frontend Types + API Client

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/config.ts`

- [ ] **Step 1: Add new TypeScript interfaces to `types.ts`**

```typescript
export interface BikeModel {
  id: number
  slug: string
  brand: string
  name: string
  engine_cc: number
  image_url: string | null
  ad_count: number
  min_price: number | null
  max_price: number | null
}

export interface BikeVariant {
  id: number
  bike_model_id: number
  variant_name: string
  color: string
  wheel_type: string
  new_price: number
  color_hex: string | null
}

export interface BikeModelConfig {
  warranty_years: number
  warranty_value_per_year: number
  mechanical_wear_per_km: number
  condition_risk_per_km: number
  short_term_km_threshold: number
}

export interface BikeModelDetail {
  model: BikeModel
  config: BikeModelConfig
}
```

- [ ] **Step 2: Update `api.ts` — all functions accept `slug` parameter**

Every API function that currently calls `/api/ads/...`, `/api/stats`, etc. must be updated to accept a `slug` parameter and prefix the URL with `/bike-models/${slug}`.

```typescript
export function fetchAds(slug: string, params?: { ... }): Promise<AdsResponse> {
  // ... same params handling ...
  return fetchJSON<AdsResponse>(`/bike-models/${slug}/ads${qs ? '?' + qs : ''}`)
}

export function fetchAd(slug: string, id: number): Promise<AdDetail> {
  return fetchJSON<AdDetail>(`/bike-models/${slug}/ads/${id}`)
}

export function fetchStats(slug: string): Promise<Stats> {
  return fetchJSON<Stats>(`/bike-models/${slug}/stats`)
}

export function fetchRankings(slug: string): Promise<Ranking[]> {
  return fetchJSON<Ranking[]>(`/bike-models/${slug}/rankings`)
}
```

Apply to ALL functions in the file. Also add new functions:

```typescript
export function fetchBikeModels(): Promise<BikeModel[]> {
  return fetchJSON<BikeModel[]>('/bike-models')
}

export function fetchBikeModel(slug: string): Promise<BikeModelDetail> {
  return fetchJSON<BikeModelDetail>(`/bike-models/${slug}`)
}

export function fetchBikeVariants(slug: string): Promise<BikeVariant[]> {
  return fetchJSON<BikeVariant[]>(`/bike-models/${slug}/variants`)
}

export function fetchAdModelSlug(id: number): Promise<{ slug: string }> {
  return fetchJSON<{ slug: string }>(`/ads/${id}/model-slug`)
}
```

Repeat for every function — crawl, catalog, accessories, check-online, merge, etc. Every URL changes.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/types.ts src/lib/api.ts && cd ..
git commit -m "feat: add bike model types and scope all API calls by slug"
```

---

## Task 10: Frontend Hooks

**Files:**
- Create: `frontend/src/hooks/useCurrentModel.ts`
- Modify: `frontend/src/hooks/queries.ts`

- [ ] **Step 1: Create `useCurrentModel` hook**

```typescript
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
import * as api from '../lib/api'
import type { BikeModelDetail, BikeVariant } from '../types'

interface ModelContext {
  slug: string
  model: BikeModelDetail
  variants: BikeVariant[]
  modelUrl: (path: string) => string
}

export const ModelCtx = createContext<ModelContext | null>(null)

export function useCurrentModel() {
  const ctx = useContext(ModelCtx)
  if (!ctx) throw new Error('useCurrentModel must be used within ModelLayout')
  return ctx
}

export function useModelData(slug: string) {
  const modelQuery = useQuery({
    queryKey: ['bike-model', slug],
    queryFn: () => api.fetchBikeModel(slug),
  })
  const variantsQuery = useQuery({
    queryKey: ['bike-variants', slug],
    queryFn: () => api.fetchBikeVariants(slug),
  })
  return { modelQuery, variantsQuery }
}

export function useVariantColor(variantName: string | null | undefined): string {
  const { variants } = useCurrentModel()
  if (!variantName) return '#6b7280'
  const palette = ['#d97706', '#2563eb', '#059669', '#6b7280', '#dc2626', '#7c3aed', '#0891b2', '#ea580c']
  const variant = variants.find(v => v.variant_name === variantName)
  if (variant?.color_hex) return variant.color_hex
  // Fallback: assign from palette by unique variant name index
  const uniqueNames = [...new Set(variants.map(v => v.variant_name))]
  const idx = uniqueNames.indexOf(variantName)
  return palette[idx >= 0 ? idx % palette.length : 0]
}
```

- [ ] **Step 2: Update `queries.ts` — namespace all query keys by slug**

Every hook must accept `slug` as a parameter and include it in the query key.

```typescript
export function useAds(slug: string, params?: Parameters<typeof api.fetchAds>[1]) {
  return useQuery({
    queryKey: ['ads', slug, params],
    queryFn: () => api.fetchAds(slug, params),
  })
}

export function useAd(slug: string, id: number) {
  return useQuery({
    queryKey: ['ad', slug, id],
    queryFn: () => api.fetchAd(slug, id),
  })
}

export function useStats(slug: string) {
  return useQuery({
    queryKey: ['stats', slug],
    queryFn: () => api.fetchStats(slug),
  })
}

export function useRankings(slug: string) {
  return useQuery({
    queryKey: ['rankings', slug],
    queryFn: () => api.fetchRankings(slug),
  })
}
```

**Critical:** Update ALL `invalidateQueries` calls in mutations to include `slug`:
```typescript
export function useConfirmAd(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (adData: Record<string, unknown>) => api.confirmAd(slug, adData),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ads', slug] })
      void qc.invalidateQueries({ queryKey: ['stats', slug] })
      void qc.invalidateQueries({ queryKey: ['rankings', slug] })
    },
  })
}
```

Apply this pattern to ALL ~30 hooks in the file. Every query key and mutation function call must include `slug`.

Add new hooks:
```typescript
export function useBikeModels() {
  return useQuery({
    queryKey: ['bike-models'],
    queryFn: api.fetchBikeModels,
  })
}
```

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/hooks/ && cd ..
git commit -m "feat: add model context hook, namespace all query keys by slug"
```

---

## Task 11: Frontend Routing + Layouts

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`
- Create: `frontend/src/components/ModelLayout.tsx`
- Create: `frontend/src/pages/LandingPage.tsx`
- Create: `frontend/src/components/LegacyRedirect.tsx`

- [ ] **Step 1: Create `ModelLayout.tsx`**

```tsx
import { Outlet, useParams } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { ModelCtx, useModelData } from '../hooks/useCurrentModel'

export function ModelLayout() {
  const { slug } = useParams<{ slug: string }>()
  const { modelQuery, variantsQuery } = useModelData(slug!)

  if (modelQuery.isLoading || variantsQuery.isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Chargement...</div>
  }
  if (modelQuery.isError || !modelQuery.data) {
    return <div className="flex items-center justify-center min-h-screen">Modèle non trouvé</div>
  }

  const ctx = {
    slug: slug!,
    model: modelQuery.data,
    variants: variantsQuery.data ?? [],
    modelUrl: (path: string) => `/models/${slug}${path}`,
  }

  return (
    <ModelCtx.Provider value={ctx}>
      <div className="flex min-h-screen relative">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-amber-500/[0.03] rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 left-1/6 w-[400px] h-[400px] bg-blue-500/[0.02] rounded-full blur-[100px]" />
        </div>
        <Sidebar />
        <main className="flex-1 ml-0 md:ml-60 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0 relative z-10">
          <div className="max-w-7xl mx-auto px-5 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </ModelCtx.Provider>
  )
}
```

- [ ] **Step 2: Create `LandingPage.tsx`**

```tsx
import { Link, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBikeModels } from '../hooks/queries'
import type { BikeModel } from '../types'

export function LandingPage() {
  const { t } = useTranslation()
  const { data: models, isLoading } = useBikeModels()

  if (isLoading) return <div className="flex items-center justify-center min-h-screen">...</div>

  // Auto-redirect if single model
  if (models && models.length === 1) {
    return <Navigate to={`/models/${models[0].slug}/rankings`} replace />
  }

  if (!models || models.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-zinc-400">{t('landing.empty')}</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-5 py-12">
      <h1 className="text-3xl font-bold text-zinc-100 mb-8">{t('landing.title')}</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {models.map((m: BikeModel) => (
          <Link
            key={m.slug}
            to={`/models/${m.slug}/rankings`}
            className="group bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:border-zinc-600 transition-colors"
            aria-label={`${m.brand} ${m.name} — ${m.ad_count} ${t('landing.ads')}, ${m.min_price ?? '?'} € – ${m.max_price ?? '?'} €`}
          >
            {m.image_url && (
              <img src={m.image_url} alt={m.name} className="w-full h-40 object-contain mb-4 rounded-lg" />
            )}
            <h2 className="text-lg font-semibold text-zinc-100 group-hover:text-amber-400 transition-colors">{m.name}</h2>
            <p className="text-sm text-zinc-400">{m.brand}</p>
            <p className="text-sm text-emerald-400 mt-2">
              {m.ad_count > 0
                ? `${m.ad_count} ${t('landing.ads')} · ${m.min_price?.toLocaleString()} € – ${m.max_price?.toLocaleString()} €`
                : t('landing.noAds')}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `LegacyRedirect.tsx`**

```tsx
import { useParams, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import * as api from '../lib/api'

export function LegacyAdRedirect() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading } = useQuery({
    queryKey: ['ad-model-slug', id],
    queryFn: () => api.fetchAdModelSlug(Number(id)),
  })

  if (isLoading) return null
  if (!data) return <Navigate to="/" replace />
  return <Navigate to={`/models/${data.slug}/ads/${id}`} replace />
}
```

- [ ] **Step 4: Update `App.tsx` routing**

```tsx
import { LandingPage } from './pages/LandingPage'
import { ModelLayout } from './components/ModelLayout'
import { LegacyAdRedirect } from './components/LegacyRedirect'

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              {/* Landing page */}
              <Route path="/" element={<LandingPage />} />

              {/* Model-scoped routes */}
              <Route path="/models/:slug" element={<ModelLayout />}>
                <Route index element={<Navigate to="rankings" replace />} />
                <Route path="rankings" element={<RankingPage />} />
                <Route path="ads/:id" element={<AdDetailPage />} />
                <Route path="stats" element={<StatsPage />} />
                <Route path="crawl" element={<CrawlPage />} />
                <Route path="catalog" element={<CatalogPage />} />
              </Route>

              {/* Legacy redirects */}
              <Route path="/models" element={<Navigate to="/" replace />} />
              <Route path="/rankings" element={<Navigate to="/models/himalayan-450/rankings" replace />} />
              <Route path="/stats" element={<Navigate to="/models/himalayan-450/stats" replace />} />
              <Route path="/catalog" element={<Navigate to="/models/himalayan-450/catalog" replace />} />
              <Route path="/crawl" element={<Navigate to="/models/himalayan-450/crawl" replace />} />
              <Route path="/ads/:id" element={<LegacyAdRedirect />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
```

- [ ] **Step 5: Simplify `Layout.tsx`**

The old `Layout` component is no longer used (replaced by `ModelLayout`). You can either delete it or keep it for the landing page wrapper if needed. The landing page doesn't use a sidebar, so it doesn't need the Layout wrapper.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/ && cd ..
git commit -m "feat: add landing page, model layout, and new routing structure"
```

---

## Task 12: Frontend Components Update

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/components/FilterBar.tsx`
- Modify: `frontend/src/components/AdCard.tsx`
- Modify: `frontend/src/components/AdForm.tsx`
- Delete: `frontend/src/lib/constants.ts`
- Modify: `frontend/src/lib/utils.ts`

- [ ] **Step 1: Update `Sidebar.tsx`**

Major changes:
- Add active model block below logo (thumbnail + name + brand + back chevron link)
- Make `NAV_KEYS` dynamic using `useCurrentModel().modelUrl()`
- Conditionally render `SidebarStats` only when model context exists
- Update "Ajouter une annonce" navigate to use `modelUrl('/?add=true')`

Use `useCurrentModel()` hook. The Sidebar is rendered inside `ModelLayout`, so the context is always available.

- [ ] **Step 2: Update `FilterBar.tsx`**

Remove hardcoded `VARIANT_OPTIONS` (lines 16-22). Fetch variant names from model context:

```tsx
const { variants } = useCurrentModel()
const uniqueVariants = [...new Set(variants.map(v => v.variant_name))]
const variantOptions = [
  { value: '', labelKey: 'filter.allVariants' },
  ...uniqueVariants.map(v => ({ value: v, label: v })),
]
```

- [ ] **Step 3: Update `AdCard.tsx`**

- Replace `variantColor` import with `useVariantColor` hook
- Replace `<Link to={`/ads/${ad.id}`}>` with `<Link to={modelUrl(`/ads/${ad.id}`)}>` using `useCurrentModel()`

- [ ] **Step 4: Update `AdForm.tsx`**

- Remove import of `VARIANTS`, `COLORS`, `WHEEL_TYPES` from `constants.ts`
- Load variant catalog from `useCurrentModel().variants`
- Derive unique variant names, colors per variant, wheel types per variant from the catalog

- [ ] **Step 5: Delete `constants.ts` and clean `utils.ts`**

Delete `frontend/src/lib/constants.ts` entirely.

From `frontend/src/lib/utils.ts`, remove `variantColor()` (lines 23-36) and `variantChartColor()` (lines 39-52). These are replaced by `useVariantColor()` hook.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/ && cd ..
git commit -m "feat: update components for model context, remove hardcoded constants"
```

---

## Task 13: Frontend Pages Update

**Files:**
- Modify: `frontend/src/pages/RankingPage.tsx`
- Modify: `frontend/src/pages/StatsPage.tsx`
- Modify: `frontend/src/pages/AdDetailPage.tsx`
- Modify: `frontend/src/pages/CrawlPage.tsx`
- Modify: `frontend/src/pages/CatalogPage.tsx`
- Modify: `frontend/src/pages/AdsPage.tsx`

All pages must:
1. Use `useCurrentModel()` to get `slug` and `modelUrl()`
2. Pass `slug` to all query hooks
3. Use `modelUrl()` for all `<Link to>` and `navigate()` calls
4. Replace `variantColor()` / `variantChartColor()` with `useVariantColor()` hook

- [ ] **Step 1: Update `RankingPage.tsx`**

- Add `const { slug, modelUrl } = useCurrentModel()`
- Change `useRankings()` to `useRankings(slug)`
- Replace all `<Link to={`/ads/${id}`}>` with `<Link to={modelUrl(`/ads/${id}`)}>`
- Replace `variantColor(variant)` with `useVariantColor(variant)` (multiple occurrences)

- [ ] **Step 2: Update `StatsPage.tsx`**

- Add `const { slug } = useCurrentModel()`
- Change `useStats()` to `useStats(slug)`
- Replace `variantChartColor()` with catalog-based colors from `useCurrentModel().variants`

- [ ] **Step 3: Update `AdDetailPage.tsx`**

- Add `const { slug, modelUrl, variants } = useCurrentModel()`
- Change `useAd(id)` to `useAd(slug, id)`
- Replace `<Link to={`/ads/${ad.superseded_by}`}>` with `<Link to={modelUrl(`/ads/${ad.superseded_by}`)}>`
- Remove imports from `constants.ts`
- Use `variants` from context for dropdowns

- [ ] **Step 4: Update `CrawlPage.tsx`**

This is the highest-risk component (~1000 lines). Systematically:
- Add `const { slug, modelUrl } = useCurrentModel()`
- Update ALL hook calls to pass `slug`: `useCrawlSearch(slug)`, `useCrawlExtract(slug)`, `useCrawlConfirm(slug)`, `useActiveCrawlSession(slug)`, `useCheckPrices(slug)`, etc.
- Replace ALL `<Link to={`/ads/${id}`}>` with `modelUrl()` equivalent
- Replace ALL `navigate()` calls
- Replace `variantColor()` usage
- Replace `VARIANTS` / `COLORS` / `WHEEL_TYPES` imports with model context

Do a thorough grep for every `/ads/`, `navigate(`, `<Link` in this file to ensure nothing is missed.

- [ ] **Step 5: Update `CatalogPage.tsx`**

- Change `useAccessoryCatalog()` to `useAccessoryCatalog(slug)`
- Update catalog price mutation hooks to pass `slug`

- [ ] **Step 6: Remove or repurpose `AdsPage.tsx`**

In the old routing, `AdsPage` was the `/` route (ad listing with add form). In the new routing, `/` is the `LandingPage` and there is no standalone ads list page within model context. Two options:
- If the "add ad" flow is still needed within model context, integrate it into the model's landing or create a route `/models/:slug/ads` rendering a simplified AdsPage with `useAds(slug, params)`.
- If not needed (ranking page is the main view), remove the AdsPage import from `App.tsx` and leave the file for later cleanup.

- [ ] **Step 7: Add page titles**

In each page, add a `useEffect` that sets `document.title`:
```tsx
useEffect(() => {
  document.title = `Classement — ${model.model.name} — BikeBargain`
}, [model.model.name])
```

- [ ] **Step 8: Commit**

```bash
cd frontend && git add src/ && cd ..
git commit -m "feat: scope all pages by model, update links and queries"
```

---

## Task 14: i18n Keys

**Files:**
- Modify: `frontend/src/i18n/locales/en.json`
- Modify: `frontend/src/i18n/locales/fr.json`

- [ ] **Step 1: Add new keys to `en.json`**

```json
{
  "landing": {
    "title": "Choose a model",
    "empty": "No model configured",
    "noAds": "No listings",
    "ads": "listings"
  },
  "nav": {
    "allModels": "All models"
  },
  "model": {
    "noSearchConfig": "Search not configured",
    "noVariants": "No variants configured"
  }
}
```

- [ ] **Step 2: Add new keys to `fr.json`**

```json
{
  "landing": {
    "title": "Choisissez un modèle",
    "empty": "Aucun modèle configuré",
    "noAds": "Aucune annonce",
    "ads": "annonces"
  },
  "nav": {
    "allModels": "Tous les modèles"
  },
  "model": {
    "noSearchConfig": "Recherche non configurée",
    "noVariants": "Aucune variante configurée"
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/i18n/ && cd ..
git commit -m "feat: add i18n keys for multi-model UI"
```

---

## Task 15: Final Verification + Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Full app verification**

Start the full app:
```bash
make dev
```

Test the following flows manually:
1. Landing page loads at `/` — auto-redirects to `/models/himalayan-450/rankings` (single model)
2. Rankings page shows existing data
3. Stats page shows existing charts
4. Catalog page shows accessories
5. Ad detail page loads correctly
6. Crawl page can start a search
7. All links navigate correctly (no broken `/ads/` links)
8. `curl http://localhost:8000/api/bike-models` returns Himalayan 450 with stats
9. Old URLs redirect correctly (`/rankings` → `/models/himalayan-450/rankings`)
10. Backward-compat API: `curl http://localhost:8000/api/ads` still works

- [ ] **Step 2: Update `CLAUDE.md`**

Update the project overview, architecture section, commands, and key design patterns to reflect multi-bike model support. Key changes:
- Add bike model concept to overview
- Update API endpoint documentation
- Update CLI commands with `--model` flag
- Add new tables to architecture section
- Update data flow diagrams

- [ ] **Step 3: Update `README.md`**

Update README with:
- Multi-brand description
- New CLI usage with `--model` flag
- API structure change
- How to add a new bike model (via API/CLI)

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: update documentation for multi-bike model support"
```
