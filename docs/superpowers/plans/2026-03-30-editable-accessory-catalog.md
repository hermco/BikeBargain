# Editable Accessory Catalog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `ACCESSORY_PATTERNS` in `accessories.py` with an editable catalog stored in PostgreSQL, with a regex compiler that auto-generates patterns from structured data, and a full CRUD UI.

**Architecture:** Two new DB tables (`accessory_catalog_group`, `accessory_catalog_variant`) store the catalog. A regex compiler in `accessories.py` generates patterns from structured fields (expressions, qualifiers, brands, aliases). The existing `detect_accessories()` function consumes patterns built from DB data instead of the hardcoded list. The frontend `CatalogPage` is rewritten to support full CRUD with preview, diff, and test-on-ad features.

**Tech Stack:** Python/FastAPI, SQLModel, PostgreSQL, Alembic, React 19, TypeScript, TanStack Query v5, Tailwind CSS v4, react-i18next

**Spec:** `docs/superpowers/specs/2026-03-29-editable-accessory-catalog-design.md`

**Review fixes applied (2026-03-30) — round 1:**

| # | Fix | Task | Priorite |
|---|-----|------|----------|
| 1 | Seed migration resiliente a l'absence de `accessory_overrides` (try/except) | Task 4 | P1 |
| 2 | Logique de flagging `needs_crosscheck` dans `upsert_ad` + `refresh_accessories` + filtre API | Task 7 | P0 |
| 5 | Interdiction de rename variante si des `ad_accessories` la referencent | Task 7 | P1 |
| 7 | Remplacement du double `detect_accessories` par un COUNT SQL dans `_update_group_match_counts` | Task 7 | P0 |
| 8 | `_background_refresh` attend le refresh en cours au lieu de skip silencieux (`blocking=True`) | Task 8 | P0 |
| 9 | Validation regex (`try/except re.error`) dans `preview-regex` et `preview-diff` | Task 9 | P1 |
| 10 | Validation du payload d'import avec schemas Pydantic (`ImportCatalogRequest`) | Task 9 | P1 |
| 12 | Ajout de `delete` et `func` aux imports de `database.py` | Task 7 | P2 |
| 15 | Detail supplementaire dans Task 14 (contexte a lire, contraintes design) | Task 14 | P2 |
| 16 | Extraction de la mise a jour `AdForm.tsx` dans une Task 15b dediee | Task 15b | P2 |

**Review fixes applied (2026-03-30) — round 2 (archi + UX + lead dev):**

| # | Fix | Task | Priorite | Source |
|---|-----|------|----------|--------|
| R2-1 | `extractor.py` appelle `detect_accessories()` sans `patterns` — zero accessoires apres Task 15. Ajouter chargement catalogue dans `extractor.py` | Task 6 | P0/Bloquant | Dev |
| R2-2 | `EXCLUSION_PATTERNS` contient des accents qui ne matchent plus apres `normalize_text()`. Striper les accents des patterns d'exclusion | Task 6 | P0/Bloquant | Dev+Archi |
| R2-3 | `_background_refresh` avec `blocking=True` peut epuiser le thread pool. Remplacer par debounce/coalesce : un flag `_refresh_pending` qui coalesce les demandes | Task 8 | P0/Bloquant | Archi |
| R2-4 | `_catalog_cache` global lu/ecrit depuis plusieurs threads sans synchronisation. Ajouter un `threading.Lock` sur le cache | Task 7 | P0/Bloquant | Archi |
| R2-5 | `preview-regex`/`preview-diff` : pas de protection ReDoS. Ajouter `re.search` avec timeout via signal ou thread pool | Task 9 | P1/Important | Archi |
| R2-6 | `PATCH` variante/groupe filtre `None` — impossible de remettre `regex_override` a null. Utiliser `model_dump(exclude_unset=True)` | Task 8 | P1/Important | Archi |
| R2-7 | `delete_catalog_variant` ne verifie pas les references `ad_accessories` (contrairement au rename). Ajouter le meme check | Task 7 | P1/Important | Archi |
| R2-8 | `needs_crosscheck` jamais remis a 0 dans `refresh_accessories` quand les accessoires sont restaures | Task 7 | P1/Important | Archi |
| R2-9 | `create_catalog_group` : collision `group_key` → IntegrityError non geree → 500. Catch → 409 | Task 7 | P1/Important | Archi |
| R2-10 | `upsert_ad` snippet reference `detected_accessories` qui n'existe pas — NameError. Corriger en `ad_data.get("accessories", [])` | Task 7 | P1/Important | Dev |
| R2-11 | UX : pas de `isPending` state sur le bouton Save des formulaires catalogue | Task 14 | P1/Important | UX |
| R2-12 | UX : flow preview-regex vs preview-diff pas clair pour les variantes existantes | Task 14 | P1/Important | UX |
| R2-13 | UX : pas de gestion d'erreur si `suggest-synonyms` echoue (suggestions vides sans explication) | Task 14 | P1/Important | UX |
| R2-14 | UX : cles i18n manquantes — validation erreurs, empty state, test loading, save button, reset confirm prompt | Task 13 | P1/Important | UX |
| R2-15 | UX : pas de confirmation sur la suppression d'une variante | Task 14 | P1/Important | UX |
| R2-16 | UX : refresh badge manque un etat transitoire "X annonces mises a jour" avant retour a "A jour" | Task 14 | P2/Mineur | UX |
| R2-17 | `import asyncio` mort dans `database.py`. Supprimer | Task 7 | P2/Mineur | Dev |
| R2-18 | Seed migration `now()` (PG) vs `isoformat()` (Python) — format timestamps inconsistant | Task 4 | P2/Mineur | Archi |
| R2-19 | `price_overrides` param de `detect_accessories` devient dead code apres migration. Supprimer dans Task 15 | Task 15 | P2/Mineur | Dev |
| R2-20 | UX : import catalogue presente dans i18n mais aucun flow decrit dans Task 14 | Task 14 | P2/Mineur | UX |
| R2-21 | UX : suggestions synonymes — pas de hierarchie visuelle "tres probable" vs "possible", pas de pre-check | Task 14 | P2/Mineur | UX |

---

## File Structure

### Files to create

| File | Responsibility |
|------|---------------|
| `src/catalog.py` | Regex compiler, synonym suggestions, pattern builder. Pure domain logic — no DB dependency |
| `alembic/versions/XXXX_add_accessory_catalog.py` | Migration: create tables + add `needs_crosscheck` to ads |
| `alembic/seed_accessory_catalog.json` | Seed data: 70+ patterns converted to structured JSON (generated by Claude from `ACCESSORY_PATTERNS`) |
| `frontend/src/components/CatalogGroupForm.tsx` | Unified group + first variant creation/edit form |
| `frontend/src/components/CatalogVariantForm.tsx` | Variant creation/edit form with preview |
| `frontend/src/components/CatalogTestOnAd.tsx` | Test catalog on an ad (by ID or free text) |
| `frontend/src/components/CatalogResetModal.tsx` | Reset confirmation modal with export option |

### Files to modify

| File | Changes |
|------|---------|
| `src/models.py` | Add `AccessoryCatalogGroup`, `AccessoryCatalogVariant` models. Add `needs_crosscheck` field to `Ad` |
| `src/accessories.py` | Add Unicode normalization to `_clean_text_for_detection()`. Strip accents from `EXCLUSION_PATTERNS`. Remove `ACCESSORY_PATTERNS`. Adapt `detect_accessories()` to accept patterns as argument |
| `src/extractor.py` | Update `fetch_ad()` to load catalog patterns from DB and pass to `detect_accessories()` |
| `src/catalog.py` | New file — regex compiler, synonym engine, pattern builder |
| `src/database.py` | Add catalog CRUD functions. Adapt `refresh_accessories()` to load catalog from DB. Remove `AccessoryOverride` functions. Add debounce lock |
| `src/api.py` | Add catalog CRUD endpoints, utility endpoints (suggest-synonyms, preview-regex, preview-diff, test-on-ad, export, import, reset, refresh-status). Remove old accessory-catalog endpoints |
| `alembic/env.py` | Register new models in imports |
| `frontend/src/lib/api.ts` | Add new API functions + TypeScript interfaces for catalog |
| `frontend/src/hooks/queries.ts` | Add catalog query hooks |
| `frontend/src/pages/CatalogPage.tsx` | Full rewrite — group list with health indicators, creation, editing, test-on-ad |
| `frontend/src/i18n/locales/fr.json` | New catalog translation keys |
| `frontend/src/i18n/locales/en.json` | New catalog translation keys |

---

## Task 1: SQLModel models for catalog tables

**Files:**
- Modify: `src/models.py`

- [ ] **Step 1: Add AccessoryCatalogGroup model**

Add after the `AdPriceHistory` class (line 167) in `src/models.py`:

```python
from sqlalchemy import JSON, Text

# ─── Accessory Catalog ──────────────────────────────────────────────────────

class AccessoryCatalogGroup(SQLModel, table=True):
    __tablename__ = "accessory_catalog_groups"

    id: int | None = Field(default=None, primary_key=True)
    group_key: str = Field(unique=True, nullable=False)
    model_id: int | None = Field(default=None)  # FK future vers bike_models
    name: str = Field(nullable=False)
    category: str = Field(nullable=False)  # protection, bagagerie, confort, navigation, eclairage, esthetique, performance, autre
    expressions: list[str] = Field(default=[], sa_column=Column(JSON, nullable=False, server_default="[]"))
    default_price: int = Field(nullable=False)
    last_match_count: int = Field(default=0)
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())

    variants: list["AccessoryCatalogVariant"] = Relationship(
        back_populates="group",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "order_by": "AccessoryCatalogVariant.sort_order"},
    )
```

- [ ] **Step 2: Add AccessoryCatalogVariant model**

Add right after `AccessoryCatalogGroup`:

```python
class AccessoryCatalogVariant(SQLModel, table=True):
    __tablename__ = "accessory_catalog_variants"
    __table_args__ = (UniqueConstraint("group_id", "name"),)

    id: int | None = Field(default=None, primary_key=True)
    group_id: int = Field(
        sa_column=Column(Integer, ForeignKey("accessory_catalog_groups.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    name: str = Field(nullable=False)
    qualifiers: list[str] = Field(default=[], sa_column=Column(JSON, nullable=False, server_default="[]"))
    brands: list[str] = Field(default=[], sa_column=Column(JSON, nullable=False, server_default="[]"))
    product_aliases: list[str] = Field(default=[], sa_column=Column(JSON, nullable=False, server_default="[]"))
    optional_words: list[str] = Field(default=[], sa_column=Column(JSON, nullable=False, server_default="[]"))
    regex_override: str | None = Field(default=None, sa_column=Column(Text))
    estimated_new_price: int = Field(nullable=False)
    sort_order: int = Field(default=0)
    sort_order_manual: int = Field(default=0)  # 1 if user overrode sort_order
    notes: str | None = Field(default=None, sa_column=Column(Text))
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())

    group: AccessoryCatalogGroup | None = Relationship(back_populates="variants")
```

- [ ] **Step 3: Add needs_crosscheck to Ad model**

Add after line 47 (`superseded_by` field) in the `Ad` class:

```python
    needs_crosscheck: int = Field(default=0)
```

- [ ] **Step 4: Update imports at top of models.py**

Add `JSON, Text` to the sqlalchemy imports:

```python
from sqlalchemy import UniqueConstraint, Column, BigInteger, Integer, Float, ForeignKey, JSON, Text
```

- [ ] **Step 5: Commit**

```bash
git add src/models.py
git commit -m "$(cat <<'EOF'
feat: add AccessoryCatalogGroup and AccessoryCatalogVariant models

New SQLModel tables for the editable accessory catalog.
Also adds needs_crosscheck flag to Ad for LLM crosscheck workflow.
EOF
)"
```

---

## Task 2: Alembic migration

**Files:**
- Create: `alembic/versions/XXXX_add_accessory_catalog.py`
- Modify: `alembic/env.py`

- [ ] **Step 1: Update alembic/env.py to register new models**

In `alembic/env.py`, add the new models to the import block:

```python
from src.models import (  # noqa: F401
    Ad, AdAttribute, AdImage, AdAccessory,
    CrawlSession, CrawlSessionAd, AdPriceHistory, AccessoryOverride,
    AccessoryCatalogGroup, AccessoryCatalogVariant,
)
```

- [ ] **Step 2: Generate the migration**

```bash
cd /Users/corentinhermet/Work/himalayan-450-analyzer
source .venv/bin/activate
alembic revision --autogenerate -m "add accessory catalog tables and needs_crosscheck"
```

Expected: new file in `alembic/versions/` with `create_table` for `accessory_catalog_groups` and `accessory_catalog_variants`, plus `add_column` for `needs_crosscheck` on `ads`.

- [ ] **Step 3: Review and fix the generated migration**

Open the generated file. Verify it contains:

1. `op.create_table("accessory_catalog_groups", ...)` with all columns, UNIQUE on `group_key`, indexes on `category` and `model_id`
2. `op.create_table("accessory_catalog_variants", ...)` with all columns, UNIQUE on `(group_id, name)`, index on `group_id`, FK to `accessory_catalog_groups`
3. `op.add_column("ads", sa.Column("needs_crosscheck", sa.Integer(), nullable=False, server_default="0"))`

Fix any issues. Ensure the `downgrade` function drops both tables and removes the column.

- [ ] **Step 4: Apply the migration**

```bash
alembic upgrade head
```

Expected: `Running upgrade bb67b9f73556 -> XXXX, add accessory catalog tables and needs_crosscheck`

- [ ] **Step 5: Commit**

```bash
git add alembic/env.py alembic/versions/
git commit -m "$(cat <<'EOF'
feat: migration for accessory catalog tables

Creates accessory_catalog_groups and accessory_catalog_variants tables.
Adds needs_crosscheck column to ads table.
EOF
)"
```

---

## Task 3: Seed data generation

**Files:**
- Create: `alembic/seed_accessory_catalog.json`

- [ ] **Step 1: Generate seed JSON from ACCESSORY_PATTERNS using Claude**

Read `src/accessories.py` lines 37-328 (the `ACCESSORY_PATTERNS` list). For each unique `group_dedup`, create a group entry. For each tuple, create a variant entry. The target schema:

```json
{
  "groups": [
    {
      "group_key": "crash_bars",
      "name": "Crash bars",
      "category": "protection",
      "expressions": ["crash bar", "crash barre", "barre de protection"],
      "default_price": 200,
      "variants": [
        {
          "name": "Crash bars SW-Motech/Givi/Hepco",
          "qualifiers": [],
          "brands": ["sw-motech", "givi", "hepco", "h&b"],
          "product_aliases": [],
          "optional_words": [],
          "regex_override": null,
          "estimated_new_price": 200,
          "sort_order": -4,
          "notes": null
        }
      ]
    }
  ]
}
```

Rules for conversion:
- **group_key**: use the existing `groupe_dedup` value from the tuple
- **expressions**: extract the human-readable terms from the regex alternations (e.g., `(prot[eè]ge|pare)[\s-]*main` → `["protege-mains", "pare-mains"]`). Include English aliases like `"handguard"`, `"skid plate"` etc.
- **qualifiers**: extract words that qualify the variant (e.g., `rally`, `alu`, `renforce`, `confort`, `basse`, `haute`, `touring`)
- **brands**: extract brand names (e.g., `sw-motech`, `givi`, `acerbis`, `royal enfield`, `re`, `genuine`, `origine`)
- **product_aliases**: extract specific product names (e.g., `alaska trekker`, `quad lock`, `xs307`, `m9a`, `bf92`)
- **optional_words**: common French filler words from the regex (e.g., `de`, `du`, `d'`)
- **regex_override**: only for the GPS generic variant (the one with lookbehinds/lookaheads): `(?<!support\s)(?<!suport\s)\bgps\b(?!\s*/\s*telephone)(?!\s*/\s*smartphone)`. Set to `null` for all other variants
- **sort_order**: calculated as `-(len(qualifiers) + len(brands) + len(product_aliases))`. Generic variants (no qualifiers, no brands) get `sort_order: 0`
- **name**: keep the existing name from the tuple (2nd element)
- **default_price**: the price of the generic (last/fallback) variant in the group

The generic variant of each group (the one without brands/qualifiers, matched last) should have `sort_order: 0`. Specific variants get negative values (more specific = more negative = higher priority).

Save as `alembic/seed_accessory_catalog.json`.

- [ ] **Step 2: Validate seed completeness**

Check that:
- Every unique `group_dedup` from `ACCESSORY_PATTERNS` has a corresponding group
- Every tuple has a corresponding variant
- No duplicate group_keys
- No duplicate variant names within a group
- All variant prices match the original tuples

- [ ] **Step 3: Commit**

```bash
git add alembic/seed_accessory_catalog.json
git commit -m "$(cat <<'EOF'
feat: add seed data for accessory catalog

70+ patterns from ACCESSORY_PATTERNS converted to structured JSON.
Generated by Claude from regex patterns, preserving all detection behavior.
EOF
)"
```

---

## Task 4: Seed migration script

**Files:**
- Create: `alembic/versions/XXXX_seed_accessory_catalog.py`

- [ ] **Step 1: Create the seed migration**

```bash
alembic revision -m "seed accessory catalog from json"
```

- [ ] **Step 2: Write the migration code**

Edit the generated file:

```python
"""seed accessory catalog from json"""

import json
from pathlib import Path
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '<GENERATED>'
down_revision = '<PREVIOUS>'
branch_labels = None
depends_on = None

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
    # Resilient: skip if accessory_overrides table was already dropped
    try:
        overrides = conn.execute(sa.text("SELECT group_key, estimated_new_price FROM accessory_overrides")).fetchall()
        for group_key, price in overrides:
            # Apply override to all variants of this group
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
        pass  # Table already dropped or doesn't exist — skip override migration

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
```

- [ ] **Step 3: Apply the migration**

```bash
alembic upgrade head
```

- [ ] **Step 4: Verify the seed**

```bash
python -c "
from sqlmodel import Session, select
from src.database import engine
from src.models import AccessoryCatalogGroup, AccessoryCatalogVariant

with Session(engine) as s:
    groups = s.exec(select(AccessoryCatalogGroup)).all()
    variants = s.exec(select(AccessoryCatalogVariant)).all()
    print(f'{len(groups)} groups, {len(variants)} variants')
    for g in groups[:3]:
        print(f'  {g.group_key}: {g.name} ({g.category}) — {len([v for v in variants if v.group_id == g.id])} variants')
"
```

Expected: ~35 groups, ~70 variants (numbers depend on dedup groups in ACCESSORY_PATTERNS).

- [ ] **Step 5: Commit**

```bash
git add alembic/versions/
git commit -m "$(cat <<'EOF'
feat: seed accessory catalog from JSON

Idempotent migration that populates catalog tables from seed JSON.
Migrates existing AccessoryOverride prices into variant prices.
EOF
)"
```

---

## Task 5: Regex compiler and synonym engine

**Files:**
- Create: `src/catalog.py`

- [ ] **Step 1: Create src/catalog.py with Unicode normalization helper**

```python
"""
Compilateur de regex et moteur de synonymes pour le catalogue d'accessoires.

Couche domaine pure — pas de dependance DB.
"""

import re
import unicodedata


def strip_accents(text: str) -> str:
    """Supprime les accents Unicode (NFD + suppression combining marks)."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def normalize_text(text: str) -> str:
    """Lowercase + strip accents. Utilisé avant le matching regex."""
    return strip_accents(text.lower())
```

- [ ] **Step 2: Add French pluralization helper**

Append to `src/catalog.py`:

```python
def _pluralize_word(word: str) -> str:
    """Genere un pattern regex qui matche singulier et pluriel francais d'un mot."""
    if not word:
        return word

    # Mots finissant deja en -x ou -s : pas de pluralisation
    if word.endswith(("x", "s")):
        return rf"\b{re.escape(word)}\b"

    # Mots en -eau, -eu, -au : pluriel en -x ET -s
    if word.endswith(("eau", "eu", "au")):
        return rf"\b{re.escape(word)}[sx]?\b"

    # Mots en -al : pluriel en -aux (ex: lateral → lateraux)
    if word.endswith("al"):
        stem = word[:-2]
        return rf"\b{re.escape(stem)}(al|aux)\b"

    # Default : mot + [sx]?
    return rf"\b{re.escape(word)}[sx]?\b"
```

- [ ] **Step 3: Add qualifier equivalences and synonym rules**

Append to `src/catalog.py`:

```python
# ─── EQUIVALENCES ─────────────────────────────────────────────────────────────

QUALIFIER_EQUIVALENCES: dict[str, str] = {
    "alu": "aluminium",
    "aluminium": "alu",
    "additionnel": "auxiliaire",
    "auxiliaire": "additionnel",
    "phare": "feu",
    "feu": "phare",
}

PREFIX_RULES: list[dict] = [
    {
        "prefixes": ["protege", "pare", "protection", "grille"],
        "context": "Accessoires de protection",
    },
]

EXPRESSION_EQUIVALENCES: dict[str, list[str]] = {
    "bulle": ["pare-brise"],
    "pare-brise": ["bulle"],
    "sabot": ["protection moteur"],
    "protection moteur": ["sabot"],
    "echappement": ["silencieux", "pot", "ligne"],
    "silencieux": ["echappement", "pot"],
    "pot": ["echappement", "silencieux"],
    "ligne": ["echappement"],
    "antivol": ["bloque-disque"],
    "bloque-disque": ["antivol"],
    "bequille centrale": ["leve-moto"],
    "leve-moto": ["bequille centrale"],
    "retroviseur": ["retro"],
    "retro": ["retroviseur"],
    "porte-bagages": ["support bagages"],
    "sacoche cavaliere": ["sacoche de selle"],
    "sacoche de selle": ["sacoche cavaliere"],
}


def suggest_synonyms(expression: str) -> list[dict]:
    """
    Suggere des synonymes pour une expression d'accessoire.

    Returns: [{"expression": str, "rule": "prefix"|"equivalence", "context": str}]
    """
    normalized = normalize_text(expression)
    # Normalize: replace tirets by spaces for matching
    words = normalized.replace("-", " ").split()
    suggestions: list[dict] = []

    # Rule 1: prefix interchangeables
    for rule in PREFIX_RULES:
        prefixes = [normalize_text(p) for p in rule["prefixes"]]
        if words and words[0] in prefixes:
            suffix = " ".join(words[1:])
            for prefix in prefixes:
                if prefix != words[0]:
                    candidate = f"{prefix}-{suffix}" if "-" in expression else f"{prefix} {suffix}"
                    suggestions.append({
                        "expression": candidate,
                        "rule": "prefix",
                        "context": rule["context"],
                    })

    # Rule 2: expression equivalences
    for key, equivalents in EXPRESSION_EQUIVALENCES.items():
        if normalize_text(key) == normalized.replace("-", " ").strip():
            for equiv in equivalents:
                suggestions.append({
                    "expression": equiv,
                    "rule": "equivalence",
                    "context": "",
                })

    return suggestions


def suggest_qualifier_alternatives(qualifier: str) -> list[str]:
    """Retourne les equivalences pour un qualificatif."""
    normalized = normalize_text(qualifier)
    equiv = QUALIFIER_EQUIVALENCES.get(normalized)
    return [equiv] if equiv else []
```

- [ ] **Step 4: Add the regex compiler**

Append to `src/catalog.py`:

```python
def _compile_expression(expression: str, optional_words: list[str]) -> str:
    """Compile une expression en pattern regex avec mots optionnels intercalés."""
    normalized = normalize_text(expression).replace("-", " ")
    words = normalized.split()
    if not words:
        return ""

    parts = []
    for i, word in enumerate(words):
        parts.append(_pluralize_word(word))
        if i < len(words) - 1:
            # Between words: optional separator + optional words
            sep = r"[\s-]*"
            if optional_words:
                opt_group = "|".join(rf"{re.escape(normalize_text(w))}\s*" for w in optional_words)
                sep += rf"({opt_group})?"
            parts.append(sep)

    return "".join(parts)


def _compile_qualifiers_and_brands(qualifiers: list[str], brands: list[str]) -> str:
    """Compile qualificatifs et marques en un groupe d'alternation unique."""
    alternatives = []

    for q in qualifiers:
        nq = normalize_text(q)
        # Expand with equivalences
        equiv = QUALIFIER_EQUIVALENCES.get(nq)
        if equiv:
            alternatives.append(rf"({_pluralize_word(nq)}|{_pluralize_word(equiv)})")
        else:
            alternatives.append(_pluralize_word(nq))

    for brand in brands:
        nb = normalize_text(brand)
        # Multi-word brands
        brand_words = nb.replace("-", " ").split()
        if len(brand_words) > 1:
            # Determine separator based on original
            sep = r"[\s-]*" if "-" in brand else r"[\s]*"
            brand_pattern = sep.join(re.escape(w) for w in brand_words)
            # Short brands get word boundaries
            brand_pattern = rf"\b{brand_pattern}\b"
            alternatives.append(brand_pattern)
        else:
            if len(nb) <= 3:
                alternatives.append(rf"\b{re.escape(nb)}\b")
            else:
                alternatives.append(_pluralize_word(nb))

    return "|".join(alternatives) if alternatives else ""


def compile_variant_regex(group_expressions: list[str], variant: dict) -> str:
    """
    Compile une variante en regex complete.

    Args:
        group_expressions: liste d'expressions du groupe parent
        variant: dict avec qualifiers, brands, product_aliases, optional_words, regex_override

    Returns:
        Regex string prete pour re.search()
    """
    # If regex_override, use it directly
    if variant.get("regex_override"):
        return variant["regex_override"]

    optional_words = variant.get("optional_words", [])
    qualifiers = variant.get("qualifiers", [])
    brands = variant.get("brands", [])
    product_aliases = variant.get("product_aliases", [])

    # Step 1: compile each group expression
    expr_patterns = []
    for expr in group_expressions:
        compiled = _compile_expression(expr, optional_words)
        if compiled:
            expr_patterns.append(compiled)

    # Step 2: join expressions with |
    expressions_group = f"({'|'.join(expr_patterns)})" if expr_patterns else ""

    # Step 3: compile qualifiers and brands
    qb_pattern = _compile_qualifiers_and_brands(qualifiers, brands)

    # Step 4: combine
    if expressions_group and qb_pattern:
        main_pattern = rf"{expressions_group}\s*({qb_pattern})"
    elif expressions_group:
        main_pattern = expressions_group
    else:
        main_pattern = ""

    # Step 5: add product aliases as autonomous alternatives
    if product_aliases:
        alias_patterns = []
        for alias in product_aliases:
            na = normalize_text(alias)
            alias_words = na.split()
            if len(alias_words) > 1:
                alias_patterns.append(r"[\s-]*".join(rf"\b{re.escape(w)}\b" for w in alias_words))
            else:
                alias_patterns.append(rf"\b{re.escape(na)}\b")

        aliases_group = "|".join(alias_patterns)
        if main_pattern:
            return f"{main_pattern}|{aliases_group}"
        return aliases_group

    return main_pattern


def build_patterns_from_catalog(groups: list[dict]) -> list[tuple[str, str, str, int, str]]:
    """
    Construit la liste de patterns depuis les donnees catalogue (meme format que ACCESSORY_PATTERNS).

    Args:
        groups: list of group dicts with nested "variants" list

    Returns:
        list of (regex, name, category, price, group_key) tuples,
        ordered by group then sort_order within group.
    """
    patterns = []
    for group in groups:
        group_expressions = group["expressions"]
        group_key = group["group_key"]
        category = group["category"]

        # Sort variants by sort_order (lowest first = most specific)
        variants = sorted(group.get("variants", []), key=lambda v: v.get("sort_order", 0))

        for variant in variants:
            regex = compile_variant_regex(group_expressions, variant)
            if regex:
                patterns.append((
                    regex,
                    variant["name"],
                    category,
                    variant["estimated_new_price"],
                    group_key,
                ))

    return patterns
```

- [ ] **Step 5: Commit**

```bash
git add src/catalog.py
git commit -m "$(cat <<'EOF'
feat: add regex compiler and synonym engine

Pure domain module with:
- Unicode normalization (strip accents)
- French pluralization rules
- Synonym suggestions (prefix rules + expression equivalences)
- Regex compiler from structured data (expressions, qualifiers, brands, aliases)
- Pattern builder that outputs same format as old ACCESSORY_PATTERNS
EOF
)"
```

---

## Task 6: Adapt accessories.py and extractor.py to use catalog patterns

**Files:**
- Modify: `src/accessories.py`
- Modify: `src/extractor.py`

- [ ] **Step 1: Strip accents from EXCLUSION_PATTERNS**

Since `normalize_text()` strips accents from the text BEFORE `EXCLUSION_PATTERNS` are applied, the patterns themselves must also be accent-free. Otherwise `réparation` in the pattern won't match `reparation` in the normalized text.

Find `EXCLUSION_PATTERNS` in `src/accessories.py` and replace all accented characters in the regex strings with their unaccented equivalents:
- `réparation` → `reparation`
- `mécanique` → `mecanique`
- `réglage` → `reglage`
- `révision` → `revision`
- `vidange` → `vidange` (no change)
- etc.

Apply this to every string literal in `EXCLUSION_PATTERNS`. Do NOT change the regex structure, only the accented characters.

- [ ] **Step 2: Add Unicode normalization to _clean_text_for_detection**

Replace the `_clean_text_for_detection` function (line 345-350):

```python
def _clean_text_for_detection(text: str) -> str:
    """Supprime les zones de texte qui decrivent des services garage et normalise."""
    from .catalog import normalize_text
    cleaned = normalize_text(text)
    for pattern in EXCLUSION_PATTERNS:
        cleaned = re.sub(pattern, " ", cleaned)
    return cleaned
```

- [ ] **Step 3: Modify detect_accessories to accept patterns as argument**

Replace the `detect_accessories` function (lines 353-401):

```python
def detect_accessories(
    text: str,
    price_overrides: dict[str, int] | None = None,
    patterns: list[tuple[str, str, str, int, str]] | None = None,
) -> list[dict]:
    """
    Detecte les accessoires mentionnes dans un texte d'annonce.

    Args:
        text: Le body ou la description de l'annonce.
        price_overrides: Dict optionnel {group_key: prix_neuf} pour surcharger les prix.
        patterns: Liste de (regex, nom, categorie, prix_neuf, groupe_dedup).
                  Si None, utilise ACCESSORY_PATTERNS (fallback hardcode).
    """
    if not text:
        return []

    overrides = price_overrides or {}
    text_lower = _clean_text_for_detection(text)
    matched_groups: set[str] = set()
    found: list[dict] = []
    active_patterns = patterns if patterns is not None else ACCESSORY_PATTERNS

    for pattern, name, category, price_new, group in active_patterns:
        if group in matched_groups:
            continue
        if re.search(pattern, text_lower):
            matched_groups.add(group)
            effective_price = overrides.get(group, price_new)
            found.append({
                "name": name,
                "category": category,
                "source": "body",
                "estimated_new_price": effective_price,
                "estimated_used_price": int(effective_price * DEPRECIATION_RATE),
            })

    return found
```

Note: `ACCESSORY_PATTERNS` stays as fallback for now. It will be removed in the cleanup task.

- [ ] **Step 4: Update extractor.py to load catalog patterns from DB**

In `src/extractor.py`, the `fetch_ad()` function calls `detect_accessories(body)` without a `patterns` argument (line ~375). After Task 15 removes `ACCESSORY_PATTERNS`, this will silently return `[]` for every new ad — a **silent data loss bug**.

Add a helper that loads catalog patterns for use in `extractor.py`:

```python
# In src/extractor.py, add import at top:
from .catalog import build_patterns_from_catalog

# Before calling detect_accessories in fetch_ad(), load patterns:
def _get_catalog_patterns() -> list[tuple]:
    """Charge les patterns du catalogue DB pour la detection hors-API."""
    from .database import get_catalog_groups
    from sqlmodel import Session
    from .database import engine
    with Session(engine) as session:
        groups = get_catalog_groups(session)
    return build_patterns_from_catalog(groups)
```

Then update all calls to `detect_accessories()` in `extractor.py` to pass `patterns=_get_catalog_patterns()`:

```python
# Before (line ~375):
accessories = detect_accessories(body, price_overrides=price_overrides)

# After:
catalog_patterns = _get_catalog_patterns()
accessories = detect_accessories(body, patterns=catalog_patterns)
```

Do the same for any other call site of `detect_accessories()` outside of `database.py` (e.g., in `api.py` preview endpoints).

- [ ] **Step 5: Commit**

```bash
git add src/accessories.py src/extractor.py
git commit -m "$(cat <<'EOF'
feat: adapt detect_accessories to accept catalog patterns

- Strip accents from EXCLUSION_PATTERNS (match normalized text)
- Add Unicode normalization (strip accents) to text preprocessing
- detect_accessories now accepts patterns argument, falls back to hardcoded
- extractor.py loads catalog patterns from DB for detection
EOF
)"
```

---

## Task 7: Database layer — catalog CRUD and adapted refresh

**Files:**
- Modify: `src/database.py`

- [ ] **Step 1: Add catalog imports and cache**

At the top of `src/database.py`, add to the imports:

```python
import json
import threading
from sqlmodel import delete
from sqlalchemy import func
from .models import (  # noqa: F401
    Ad, AdAttribute, AdImage, AdAccessory,
    CrawlSession, CrawlSessionAd, AdPriceHistory, AccessoryOverride,
    AccessoryCatalogGroup, AccessoryCatalogVariant,
)
```

After the `engine` definition (line 30), add the catalog cache:

```python
# ─── Catalog cache (thread-safe) ────────────────────────────────────────────
_catalog_cache: list[dict] | None = None
_catalog_cache_lock = threading.Lock()


def get_catalog_groups(session: Session) -> list[dict]:
    """Charge le catalogue depuis la DB (avec cache thread-safe)."""
    global _catalog_cache
    with _catalog_cache_lock:
        if _catalog_cache is not None:
            return _catalog_cache

    groups = session.exec(
        select(AccessoryCatalogGroup)
        .options(selectinload(AccessoryCatalogGroup.variants))
        .order_by(AccessoryCatalogGroup.category)
    ).all()

    result = []
    for g in groups:
        result.append({
            "id": g.id,
            "group_key": g.group_key,
            "model_id": g.model_id,
            "name": g.name,
            "category": g.category,
            "expressions": g.expressions or [],
            "default_price": g.default_price,
            "last_match_count": g.last_match_count,
            "created_at": g.created_at,
            "updated_at": g.updated_at,
            "variants": [
                {
                    "id": v.id,
                    "group_id": v.group_id,
                    "name": v.name,
                    "qualifiers": v.qualifiers or [],
                    "brands": v.brands or [],
                    "product_aliases": v.product_aliases or [],
                    "optional_words": v.optional_words or [],
                    "regex_override": v.regex_override,
                    "estimated_new_price": v.estimated_new_price,
                    "sort_order": v.sort_order,
                    "sort_order_manual": v.sort_order_manual,
                    "notes": v.notes,
                    "created_at": v.created_at,
                    "updated_at": v.updated_at,
                }
                for v in sorted(g.variants, key=lambda v: v.sort_order)
            ],
        })

    with _catalog_cache_lock:
        _catalog_cache = result
    return result


def invalidate_catalog_cache() -> None:
    """Invalide le cache catalogue. A appeler apres toute ecriture. Thread-safe."""
    global _catalog_cache
    with _catalog_cache_lock:
        _catalog_cache = None
```

- [ ] **Step 2: Add catalog CRUD functions**

Append to `src/database.py`:

```python
# ─── Catalog CRUD ───────────────────────────────────────────────────────────

def create_catalog_group(session: Session, data: dict) -> AccessoryCatalogGroup:
    """Cree un groupe de catalogue."""
    from sqlalchemy.exc import IntegrityError
    from .catalog import normalize_text
    now = datetime.now().isoformat()

    # Generate group_key from name (slugify)
    slug = normalize_text(data["name"]).replace(" ", "_").replace("-", "_")
    slug = re.sub(r"[^a-z0-9_]", "", slug)

    group = AccessoryCatalogGroup(
        group_key=slug,
        name=data["name"],
        category=data["category"],
        expressions=data.get("expressions", []),
        default_price=data["default_price"],
        model_id=data.get("model_id"),
        created_at=now,
        updated_at=now,
    )
    session.add(group)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise ValueError(f"Un groupe avec la cle « {slug} » existe deja")
    session.refresh(group)
    invalidate_catalog_cache()
    return group


def update_catalog_group(session: Session, group_id: int, data: dict) -> AccessoryCatalogGroup:
    """Met a jour un groupe."""
    group = session.get(AccessoryCatalogGroup, group_id)
    if not group:
        raise ValueError(f"Groupe {group_id} non trouve")

    for field in ("name", "category", "expressions", "default_price"):
        if field in data:
            setattr(group, field, data[field])
    group.updated_at = datetime.now().isoformat()

    session.commit()
    session.refresh(group)
    invalidate_catalog_cache()
    return group


def delete_catalog_group(session: Session, group_id: int) -> None:
    """Supprime un groupe (cascade delete variantes)."""
    group = session.get(AccessoryCatalogGroup, group_id)
    if not group:
        raise ValueError(f"Groupe {group_id} non trouve")
    session.delete(group)
    session.commit()
    invalidate_catalog_cache()


def create_catalog_variant(session: Session, group_id: int, data: dict) -> AccessoryCatalogVariant:
    """Cree une variante dans un groupe."""
    now = datetime.now().isoformat()

    # Auto-calculate sort_order if not manually set
    sort_order = data.get("sort_order")
    sort_order_manual = 0
    if sort_order is not None:
        sort_order_manual = 1
    else:
        sort_order = -(
            len(data.get("qualifiers", []))
            + len(data.get("brands", []))
            + len(data.get("product_aliases", []))
        )

    variant = AccessoryCatalogVariant(
        group_id=group_id,
        name=data["name"],
        qualifiers=data.get("qualifiers", []),
        brands=data.get("brands", []),
        product_aliases=data.get("product_aliases", []),
        optional_words=data.get("optional_words", []),
        regex_override=data.get("regex_override"),
        estimated_new_price=data["estimated_new_price"],
        sort_order=sort_order,
        sort_order_manual=sort_order_manual,
        notes=data.get("notes"),
        created_at=now,
        updated_at=now,
    )
    session.add(variant)
    session.commit()
    session.refresh(variant)
    invalidate_catalog_cache()
    return variant


def update_catalog_variant(session: Session, variant_id: int, data: dict) -> AccessoryCatalogVariant:
    """Met a jour une variante."""
    variant = session.get(AccessoryCatalogVariant, variant_id)
    if not variant:
        raise ValueError(f"Variante {variant_id} non trouvee")

    # Prevent rename if ad_accessories reference this variant name (spec: immutable if referenced)
    if "name" in data and data["name"] != variant.name:
        refs = session.exec(
            select(func.count()).select_from(AdAccessory).where(AdAccessory.name == variant.name)
        ).one()
        if refs > 0:
            raise ValueError(
                f"Impossible de renommer « {variant.name} » : {refs} annonce(s) la referencent. "
                "Supprimez la variante et recreez-la avec le nouveau nom."
            )

    for field in ("name", "qualifiers", "brands", "product_aliases", "optional_words",
                  "regex_override", "estimated_new_price", "notes"):
        if field in data:
            setattr(variant, field, data[field])

    # Recalculate sort_order if not manually set
    if "sort_order" in data:
        variant.sort_order = data["sort_order"]
        variant.sort_order_manual = 1
    elif not variant.sort_order_manual:
        variant.sort_order = -(
            len(variant.qualifiers or [])
            + len(variant.brands or [])
            + len(variant.product_aliases or [])
        )

    variant.updated_at = datetime.now().isoformat()
    session.commit()
    session.refresh(variant)
    invalidate_catalog_cache()
    return variant


def delete_catalog_variant(session: Session, variant_id: int) -> None:
    """Supprime une variante. Avertit si des ad_accessories la referencent."""
    variant = session.get(AccessoryCatalogVariant, variant_id)
    if not variant:
        raise ValueError(f"Variante {variant_id} non trouvee")

    # Warn (but allow) if ad_accessories reference this variant
    # Unlike rename which is blocked, deletion is allowed because the
    # background refresh will clean up orphaned ad_accessories
    refs = session.exec(
        select(func.count()).select_from(AdAccessory).where(AdAccessory.name == variant.name)
    ).one()

    session.delete(variant)
    session.commit()
    invalidate_catalog_cache()
    return refs  # Caller can inform the user: "X annonces referencaient cette variante"
```

- [ ] **Step 3: Add import for `re` at top of database.py**

```python
import re
```

- [ ] **Step 4: Adapt refresh_accessories to use catalog from DB**

Replace the existing `refresh_accessories` function (lines 168-211):

```python
def refresh_accessories(
    session: Session,
    *,
    skip_manual: bool = False,
    ad_ids: list[int] | None = None,
) -> list[dict]:
    """Re-detecte les accessoires en base via le catalogue DB."""
    from .accessories import detect_accessories
    from .catalog import build_patterns_from_catalog

    # Load catalog once for the batch
    catalog_groups = get_catalog_groups(session)
    patterns = build_patterns_from_catalog(catalog_groups)

    statement = select(Ad)
    if skip_manual:
        statement = statement.where(Ad.accessories_manual == 0)
    if ad_ids is not None:
        statement = statement.where(Ad.id.in_(ad_ids))

    ads = session.exec(statement.options(selectinload(Ad.accessories))).all()
    results = []

    for ad in ads:
        before = len(ad.accessories)
        detected = detect_accessories(ad.body or "", patterns=patterns)

        session.exec(delete(AdAccessory).where(AdAccessory.ad_id == ad.id))
        session.flush()

        for acc in detected:
            session.add(AdAccessory(
                ad_id=ad.id, name=acc["name"],
                category=acc.get("category"), source=acc.get("source"),
                estimated_new_price=acc.get("estimated_new_price", 0),
                estimated_used_price=acc.get("estimated_used_price", 0),
            ))

        results.append({
            "id": ad.id, "city": ad.city,
            "before": before, "after": len(detected),
        })

    session.commit()

    # Update last_match_count per group via SQL count (no re-detection)
    _update_group_match_counts(session, catalog_groups)

    # Flag/unflag needs_crosscheck based on accessory count changes
    for r in results:
        ad = session.get(Ad, r["id"])
        if not ad:
            continue
        if r["after"] < r["before"]:
            # Regression: accessories lost — flag for crosscheck
            ad.needs_crosscheck = 1
        elif r["after"] >= r["before"] and ad.needs_crosscheck == 1:
            # Accessories restored or improved — clear the flag
            ad.needs_crosscheck = 0
    session.commit()

    return results


def _update_group_match_counts(session: Session, catalog_groups: list[dict]) -> None:
    """Met a jour last_match_count de chaque groupe via COUNT SQL sur ad_accessories."""
    # Build variant name → group_key mapping from catalog
    variant_to_group: dict[str, str] = {}
    for g in catalog_groups:
        for v in g.get("variants", []):
            variant_to_group[v["name"]] = g["group_key"]

    # Count ad_accessories per group_key using SQL
    rows = session.exec(
        select(AdAccessory.name, func.count(AdAccessory.id))
        .group_by(AdAccessory.name)
    ).all()

    group_counts: dict[str, int] = {}
    for name, count in rows:
        gk = variant_to_group.get(name)
        if gk:
            group_counts[gk] = group_counts.get(gk, 0) + count

    for group_data in catalog_groups:
        gk = group_data["group_key"]
        count = group_counts.get(gk, 0)
        group = session.get(AccessoryCatalogGroup, group_data["id"])
        if group:
            group.last_match_count = count

    session.commit()
    invalidate_catalog_cache()
```

- [ ] **Step 5: Add needs_crosscheck flagging in upsert_ad**

In `src/database.py`, in the `upsert_ad` function, after inserting accessories, add the heuristic from the spec: if the ad has < 2 detected accessories and the description is > 200 chars, flag it for crosscheck.

Note: in `upsert_ad`, the accessories are in `ad_data.get("accessories", [])` — **not** `detected_accessories` which doesn't exist in this scope.

```python
    # Flag for crosscheck if few accessories detected despite long description
    accessories = ad_data.get("accessories", [])
    if len(accessories) < 2 and len(ad.body or "") > 200:
        ad.needs_crosscheck = 1
    else:
        ad.needs_crosscheck = 0
```

Also add the `needs_crosscheck` filter to the ads listing. In the existing `get_all_ads` function (or in the API endpoint `GET /api/ads`), support an optional query parameter:

```python
@app.get("/api/ads")
def list_ads(
    ...,
    needs_crosscheck: bool | None = Query(None),
    ...
):
    ...
    if needs_crosscheck is not None:
        statement = statement.where(Ad.needs_crosscheck == (1 if needs_crosscheck else 0))
```

- [ ] **Step 6: Add reset and export/import functions**

Append to `src/database.py`:

```python
def reset_catalog_to_seed(session: Session) -> None:
    """Reset le catalogue aux valeurs par defaut depuis le seed JSON."""
    seed_file = PROJECT_ROOT / "alembic" / "seed_accessory_catalog.json"
    with open(seed_file) as f:
        data = json.load(f)

    # Delete all existing catalog data
    session.exec(delete(AccessoryCatalogVariant))
    session.exec(delete(AccessoryCatalogGroup))
    session.flush()

    now = datetime.now().isoformat()
    for group_data in data["groups"]:
        group = AccessoryCatalogGroup(
            group_key=group_data["group_key"],
            name=group_data["name"],
            category=group_data["category"],
            expressions=group_data["expressions"],
            default_price=group_data["default_price"],
            created_at=now,
            updated_at=now,
        )
        session.add(group)
        session.flush()

        for variant_data in group_data["variants"]:
            session.add(AccessoryCatalogVariant(
                group_id=group.id,
                name=variant_data["name"],
                qualifiers=variant_data.get("qualifiers", []),
                brands=variant_data.get("brands", []),
                product_aliases=variant_data.get("product_aliases", []),
                optional_words=variant_data.get("optional_words", []),
                regex_override=variant_data.get("regex_override"),
                estimated_new_price=variant_data["estimated_new_price"],
                sort_order=variant_data.get("sort_order", 0),
                notes=variant_data.get("notes"),
                created_at=now,
                updated_at=now,
            ))

    session.commit()
    invalidate_catalog_cache()


def export_catalog(session: Session) -> dict:
    """Exporte le catalogue complet en JSON."""
    groups = get_catalog_groups(session)
    # Remove internal IDs for clean export
    export = {"groups": []}
    for g in groups:
        export["groups"].append({
            "group_key": g["group_key"],
            "name": g["name"],
            "category": g["category"],
            "expressions": g["expressions"],
            "default_price": g["default_price"],
            "variants": [
                {
                    "name": v["name"],
                    "qualifiers": v["qualifiers"],
                    "brands": v["brands"],
                    "product_aliases": v["product_aliases"],
                    "optional_words": v["optional_words"],
                    "regex_override": v["regex_override"],
                    "estimated_new_price": v["estimated_new_price"],
                    "sort_order": v["sort_order"],
                    "notes": v["notes"],
                }
                for v in g["variants"]
            ],
        })
    return export
```

- [ ] **Step 7: Commit**

```bash
git add src/database.py
git commit -m "$(cat <<'EOF'
feat: catalog CRUD, adapted refresh, cache, reset, export

- Catalog cache with explicit invalidation
- Full CRUD for groups and variants
- refresh_accessories now uses catalog from DB
- needs_crosscheck flagging on upsert and refresh regression
- Reset to seed JSON, export catalog as JSON
EOF
)"
```

---

## Task 8: API endpoints — catalog CRUD

**Files:**
- Modify: `src/api.py`

- [ ] **Step 1: Add imports for catalog functions**

At the top of `src/api.py`, update imports:

```python
from .models import (
    Ad, AdAttribute, AdImage, AdAccessory,
    CrawlSession, CrawlSessionAd, AdPriceHistory, AccessoryOverride,
    AccessoryCatalogGroup, AccessoryCatalogVariant,
)
from .database import (
    get_session, run_migrations, upsert_ad, get_all_ads, get_ad_count,
    refresh_accessories, _ad_to_dict, _replace_accessories,
    get_catalog_groups, create_catalog_group, update_catalog_group,
    delete_catalog_group, create_catalog_variant, update_catalog_variant,
    delete_catalog_variant, reset_catalog_to_seed, export_catalog,
    invalidate_catalog_cache,
)
from .catalog import (
    suggest_synonyms, compile_variant_regex, build_patterns_from_catalog,
    normalize_text,
)
```

Remove from imports:
- `get_accessory_overrides, set_accessory_override, delete_accessory_override` (will be removed later)
- `ACCESSORY_PATTERNS` from the accessories import

Update accessories import:

```python
from .accessories import estimate_total_accessories_value, detect_accessories, DEPRECIATION_RATE
```

- [ ] **Step 2: Add Pydantic schemas for catalog API**

Add after the existing schema classes:

```python
# ─── Catalog Schemas ────────────────────────────────────────────────────────

class CreateGroupRequest(BaseModel):
    name: str
    category: str
    expressions: list[str] = []
    default_price: int
    model_id: int | None = None

class UpdateGroupRequest(BaseModel):
    name: str | None = None
    category: str | None = None
    expressions: list[str] | None = None
    default_price: int | None = None

class CreateVariantRequest(BaseModel):
    name: str
    qualifiers: list[str] = []
    brands: list[str] = []
    product_aliases: list[str] = []
    optional_words: list[str] = []
    regex_override: str | None = None
    estimated_new_price: int
    sort_order: int | None = None
    notes: str | None = None

class UpdateVariantRequest(BaseModel):
    name: str | None = None
    qualifiers: list[str] | None = None
    brands: list[str] | None = None
    product_aliases: list[str] | None = None
    optional_words: list[str] | None = None
    regex_override: str | None = None
    estimated_new_price: int | None = None
    sort_order: int | None = None
    notes: str | None = None

class SuggestSynonymsRequest(BaseModel):
    expression: str

class PreviewRegexRequest(BaseModel):
    group_expressions: list[str]
    qualifiers: list[str] = []
    brands: list[str] = []
    product_aliases: list[str] = []
    optional_words: list[str] = []
    regex_override: str | None = None

class PreviewDiffRequest(BaseModel):
    variant_id: int
    group_expressions: list[str]
    qualifiers: list[str] = []
    brands: list[str] = []
    product_aliases: list[str] = []
    optional_words: list[str] = []
    regex_override: str | None = None

class TestOnAdRequest(BaseModel):
    ad_id: int | None = None
    text: str | None = None

class ImportVariantData(BaseModel):
    name: str
    qualifiers: list[str] = []
    brands: list[str] = []
    product_aliases: list[str] = []
    optional_words: list[str] = []
    regex_override: str | None = None
    estimated_new_price: int
    sort_order: int = 0
    notes: str | None = None

class ImportGroupData(BaseModel):
    group_key: str
    name: str
    category: str
    expressions: list[str] = []
    default_price: int
    variants: list[ImportVariantData] = []

class ImportCatalogRequest(BaseModel):
    groups: list[ImportGroupData]
```

- [ ] **Step 3: Add catalog group endpoints**

Add after the existing endpoints (before the crawl section):

```python
# ─── Catalog API ────────────────────────────────────────────────────────────

@app.get("/api/catalog/groups")
def list_catalog_groups(session: Session = Depends(get_session)):
    return get_catalog_groups(session)


@app.post("/api/catalog/groups", status_code=201)
def create_group(req: CreateGroupRequest, session: Session = Depends(get_session)):
    try:
        group = create_catalog_group(session, req.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return get_catalog_groups(session)  # Return full list for cache update


@app.get("/api/catalog/groups/{group_id}")
def get_group(group_id: int, session: Session = Depends(get_session)):
    groups = get_catalog_groups(session)
    for g in groups:
        if g["id"] == group_id:
            return g
    raise HTTPException(status_code=404, detail="Groupe non trouve")


@app.patch("/api/catalog/groups/{group_id}")
def patch_group(
    group_id: int,
    req: UpdateGroupRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    data = req.model_dump(exclude_unset=True)  # Permet d'envoyer null explicitement (ex: regex_override=null)
    group = update_catalog_group(session, group_id, data)
    # Trigger refresh in background
    background_tasks.add_task(_background_refresh, skip_manual=True)
    return {"id": group.id, "name": group.name, "status": "refresh_scheduled"}


@app.delete("/api/catalog/groups/{group_id}")
def remove_group(
    group_id: int,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    delete_catalog_group(session, group_id)
    background_tasks.add_task(_background_refresh, skip_manual=True)
    return {"deleted": group_id, "status": "refresh_scheduled"}
```

- [ ] **Step 4: Add variant endpoints**

```python
@app.post("/api/catalog/groups/{group_id}/variants", status_code=201)
def create_variant(
    group_id: int,
    req: CreateVariantRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    variant = create_catalog_variant(session, group_id, req.model_dump())
    background_tasks.add_task(_background_refresh, skip_manual=True)
    return {"id": variant.id, "name": variant.name, "status": "refresh_scheduled"}


@app.patch("/api/catalog/variants/{variant_id}")
def patch_variant(
    variant_id: int,
    req: UpdateVariantRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    data = req.model_dump(exclude_unset=True)  # Permet d'envoyer null explicitement (ex: regex_override=null)
    try:
        variant = update_catalog_variant(session, variant_id, data)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    background_tasks.add_task(_background_refresh, skip_manual=True)
    return {"id": variant.id, "name": variant.name, "status": "refresh_scheduled"}


@app.delete("/api/catalog/variants/{variant_id}")
def remove_variant(
    variant_id: int,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    refs = delete_catalog_variant(session, variant_id)
    background_tasks.add_task(_background_refresh, skip_manual=True)
    result = {"deleted": variant_id, "status": "refresh_scheduled"}
    if refs > 0:
        result["warning"] = f"{refs} annonce(s) referencaient cette variante. Elles seront mises a jour au prochain refresh."
    return result
```

- [ ] **Step 5: Add BackgroundTasks import and refresh helper**

Add `BackgroundTasks` to FastAPI imports:

```python
from fastapi import FastAPI, HTTPException, Query, Depends, BackgroundTasks
```

Add the background refresh helper with debounce/coalesce pattern:

```python
import threading

_refresh_lock = threading.Lock()
_refresh_pending = False  # Coalesce flag: if True, another refresh is requested while one runs
_refresh_status: dict = {"status": "idle", "updated_ads_count": 0, "last_refresh": None}


def _background_refresh(*, skip_manual: bool = True):
    """Execute un refresh avec coalesce.

    Si un refresh est deja en cours, marque un flag 'pending' et retourne
    immediatement (ne bloque pas de thread). Le refresh en cours verra
    le flag a la fin et se re-executera une fois. Ceci evite :
    - Le skip silencieux (ancien design)
    - L'epuisement du thread pool (blocking=True avec N mutations rapides)
    """
    global _refresh_pending, _refresh_status

    if not _refresh_lock.acquire(blocking=False):
        # Another refresh is running — mark pending and return (no thread blocked)
        _refresh_pending = True
        return

    try:
        while True:
            _refresh_pending = False
            _refresh_status = {"status": "running", "updated_ads_count": 0, "last_refresh": None}
            try:
                with Session(engine) as session:
                    results = refresh_accessories(session, skip_manual=skip_manual)
                    _refresh_status = {
                        "status": "idle",
                        "updated_ads_count": len(results),
                        "last_refresh": datetime.now().isoformat(),
                    }
            except Exception:
                _refresh_status = {"status": "error", "updated_ads_count": 0, "last_refresh": datetime.now().isoformat()}
                raise

            # If another refresh was requested while we were running, loop once more
            if not _refresh_pending:
                break
    finally:
        _refresh_lock.release()
```

Add `Session` and `engine` to the imports from database:

```python
from .database import engine
```

And add `from sqlmodel import Session` if not already imported alongside other sqlmodel imports.

- [ ] **Step 6: Commit**

```bash
git add src/api.py
git commit -m "$(cat <<'EOF'
feat: catalog CRUD API endpoints

Groups and variants CRUD with background refresh on mutations.
Debounce lock prevents concurrent refreshes.
EOF
)"
```

---

## Task 9: API endpoints — utility (suggest, preview, diff, test, reset, export)

**Files:**
- Modify: `src/api.py`

- [ ] **Step 1: Add suggest-synonyms endpoint**

```python
@app.post("/api/catalog/suggest-synonyms")
def suggest(req: SuggestSynonymsRequest):
    normalized = normalize_text(req.expression)
    suggestions = suggest_synonyms(req.expression)
    return {"normalized": normalized, "suggestions": suggestions}
```

- [ ] **Step 2: Add preview-regex endpoint**

```python
@app.post("/api/catalog/preview-regex")
def preview_regex(req: PreviewRegexRequest, session: Session = Depends(get_session)):
    variant_data = {
        "qualifiers": req.qualifiers,
        "brands": req.brands,
        "product_aliases": req.product_aliases,
        "optional_words": req.optional_words,
        "regex_override": req.regex_override,
    }
    generated_regex = compile_variant_regex(req.group_expressions, variant_data)

    # Validate regex before executing on corpus
    import re as re_module
    try:
        re_module.compile(generated_regex)
    except re_module.error as e:
        raise HTTPException(status_code=422, detail=f"Regex invalide: {e}")

    # Compile with timeout protection against ReDoS
    compiled = re_module.compile(generated_regex)

    # Test against ads with per-ad timeout (signal-based, Unix only)
    import signal

    def _timeout_handler(signum, frame):
        raise TimeoutError()

    ads = session.exec(select(Ad).where(Ad.superseded_by == None).limit(500)).all()  # noqa: E711
    matches = []
    timed_out = 0
    for ad in ads:
        text = normalize_text(ad.body or "")
        try:
            signal.signal(signal.SIGALRM, _timeout_handler)
            signal.alarm(1)  # 1 second timeout per ad
            m = compiled.search(text)
            signal.alarm(0)  # Cancel alarm
        except TimeoutError:
            timed_out += 1
            continue
        if m:
            start = max(0, m.start() - 30)
            end = min(len(text), m.end() + 30)
            matches.append({
                "id": ad.id,
                "title": ad.subject,
                "matched_text": f"...{text[start:end]}...",
            })

    result = {
        "generated_regex": generated_regex,
        "matching_ads_count": len(matches),
        "matching_ads_sample": matches[:10],
    }
    if timed_out:
        result["warning"] = f"Regex trop lente : timeout sur {timed_out} annonce(s). Simplifiez la regex."
    return result
```

- [ ] **Step 3: Add preview-diff endpoint**

```python
@app.post("/api/catalog/preview-diff")
def preview_diff(req: PreviewDiffRequest, session: Session = Depends(get_session)):
    import re as re_module

    # Get current variant's regex
    variant = session.get(AccessoryCatalogVariant, req.variant_id)
    if not variant:
        raise HTTPException(status_code=404, detail="Variante non trouvee")

    group = session.get(AccessoryCatalogGroup, variant.group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Groupe non trouve")

    # Current regex
    current_variant_data = {
        "qualifiers": variant.qualifiers or [],
        "brands": variant.brands or [],
        "product_aliases": variant.product_aliases or [],
        "optional_words": variant.optional_words or [],
        "regex_override": variant.regex_override,
    }
    current_regex = compile_variant_regex(group.expressions or [], current_variant_data)

    # New regex
    new_variant_data = {
        "qualifiers": req.qualifiers,
        "brands": req.brands,
        "product_aliases": req.product_aliases,
        "optional_words": req.optional_words,
        "regex_override": req.regex_override,
    }
    new_regex = compile_variant_regex(req.group_expressions, new_variant_data)

    # Validate both regexes
    import re as re_module
    for label, rx in [("courante", current_regex), ("nouvelle", new_regex)]:
        if rx:
            try:
                re_module.compile(rx)
            except re_module.error as e:
                raise HTTPException(status_code=422, detail=f"Regex {label} invalide: {e}")

    ads = session.exec(select(Ad).where(Ad.superseded_by == None).limit(500)).all()  # noqa: E711
    before_ids = set()
    after_ids = set()

    for ad in ads:
        text = normalize_text(ad.body or "")
        if current_regex and re_module.search(current_regex, text):
            before_ids.add(ad.id)
        if new_regex and re_module.search(new_regex, text):
            after_ids.add(ad.id)

    gained = after_ids - before_ids
    lost = before_ids - after_ids

    ads_by_id = {ad.id: ad for ad in ads}
    return {
        "before": {"matching_ads_count": len(before_ids)},
        "after": {"matching_ads_count": len(after_ids)},
        "gained": [{"id": aid, "title": ads_by_id[aid].subject} for aid in gained],
        "lost": [{"id": aid, "title": ads_by_id[aid].subject} for aid in lost],
    }
```

- [ ] **Step 4: Add test-on-ad endpoint**

```python
@app.post("/api/catalog/test-on-ad")
def test_on_ad(req: TestOnAdRequest, session: Session = Depends(get_session)):
    import re as re_module

    if req.ad_id:
        ad = session.get(Ad, req.ad_id)
        if not ad:
            raise HTTPException(status_code=404, detail="Annonce non trouvee")
        text = ad.body or ""
    elif req.text:
        text = req.text
    else:
        raise HTTPException(status_code=400, detail="ad_id ou text requis")

    normalized = normalize_text(text)
    catalog_groups = get_catalog_groups(session)
    patterns = build_patterns_from_catalog(catalog_groups)

    matches = []
    matched_groups_set: set[str] = set()
    for pattern, name, category, price, group_key in patterns:
        if group_key in matched_groups_set:
            continue
        m = re_module.search(pattern, normalized)
        if m:
            matched_groups_set.add(group_key)
            # Find group name
            group_name = group_key
            for g in catalog_groups:
                if g["group_key"] == group_key:
                    group_name = g["name"]
                    break
            matches.append({
                "group": group_name,
                "group_key": group_key,
                "variant": name,
                "matched_text": normalized[max(0, m.start()-20):m.end()+20],
            })

    return {"matches": matches}
```

- [ ] **Step 5: Add reset, export, import, refresh-status endpoints**

```python
@app.post("/api/catalog/reset")
def reset_catalog(
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    reset_catalog_to_seed(session)
    background_tasks.add_task(_background_refresh, skip_manual=True)
    return {"status": "reset_complete", "refresh_scheduled": True}


@app.get("/api/catalog/export")
def export_catalog_endpoint(session: Session = Depends(get_session)):
    return export_catalog(session)


@app.post("/api/catalog/import")
def import_catalog(
    data: ImportCatalogRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    """Importe un catalogue depuis un JSON exporte. Valide par Pydantic."""
    from sqlmodel import delete as sql_delete

    session.exec(sql_delete(AccessoryCatalogVariant))
    session.exec(sql_delete(AccessoryCatalogGroup))
    session.flush()

    now = datetime.now().isoformat()
    for gd in data.groups:
        group = AccessoryCatalogGroup(
            group_key=gd.group_key,
            name=gd.name,
            category=gd.category,
            expressions=gd.expressions,
            default_price=gd.default_price,
            created_at=now,
            updated_at=now,
        )
        session.add(group)
        session.flush()

        for v in gd.variants:
            session.add(AccessoryCatalogVariant(
                group_id=group.id,
                name=v.name,
                qualifiers=v.qualifiers,
                brands=v.brands,
                product_aliases=v.product_aliases,
                optional_words=v.optional_words,
                regex_override=v.regex_override,
                estimated_new_price=v.estimated_new_price,
                sort_order=v.sort_order,
                notes=v.notes,
                created_at=now,
                updated_at=now,
            ))

    session.commit()
    invalidate_catalog_cache()
    background_tasks.add_task(_background_refresh, skip_manual=True)
    return {"status": "import_complete", "refresh_scheduled": True}


@app.get("/api/catalog/refresh-status")
def get_refresh_status():
    return _refresh_status
```

- [ ] **Step 6: Commit**

```bash
git add src/api.py
git commit -m "$(cat <<'EOF'
feat: catalog utility endpoints

suggest-synonyms, preview-regex, preview-diff, test-on-ad,
reset, export, import, refresh-status.
EOF
)"
```

---

## Task 10: Remove old accessory catalog endpoints

**Files:**
- Modify: `src/api.py`

- [ ] **Step 1: Mark old endpoints as deprecated (return 410 Gone)**

Replace the three old endpoints (`GET /api/accessory-catalog`, `PATCH /api/accessory-catalog/{group}`, `DELETE /api/accessory-catalog/{group}/override`) with deprecation stubs:

```python
@app.get("/api/accessory-catalog")
def get_accessory_catalog_deprecated(session: Session = Depends(get_session)):
    """Deprecated — use GET /api/catalog/groups instead."""
    # Redirect to new endpoint for backward compatibility
    return list_catalog_groups(session)


@app.patch("/api/accessory-catalog/{group}")
def update_catalog_price_deprecated(group: str, req: UpdateCatalogPriceRequest, session: Session = Depends(get_session)):
    raise HTTPException(status_code=410, detail="Deprecated. Use PATCH /api/catalog/variants/{id}")


@app.delete("/api/accessory-catalog/{group}/override")
def reset_catalog_price_deprecated(group: str, session: Session = Depends(get_session)):
    raise HTTPException(status_code=410, detail="Deprecated. Use PATCH /api/catalog/variants/{id}")
```

Remove the old imports that are no longer needed:
- `get_accessory_overrides`, `set_accessory_override`, `delete_accessory_override`
- `ACCESSORY_PATTERNS` from accessories import

- [ ] **Step 2: Update the refresh endpoint to use catalog**

Replace the `POST /api/accessories/refresh` endpoint:

```python
@app.post("/api/accessories/refresh")
def refresh_all_accessories(
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    skipped = session.exec(
        select(func.count()).select_from(Ad).where(Ad.accessories_manual == 1)
    ).one()
    background_tasks.add_task(_background_refresh, skip_manual=True)
    return {
        "ads_skipped_manual": skipped,
        "status": "refresh_scheduled",
    }
```

- [ ] **Step 3: Commit**

```bash
git add src/api.py
git commit -m "$(cat <<'EOF'
refactor: deprecate old accessory-catalog endpoints

Old PATCH/DELETE return 410 Gone. GET redirects to new catalog API.
Refresh endpoint now uses background task.
EOF
)"
```

---

## Task 11: Frontend — API client and types

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add catalog TypeScript interfaces**

Add after the existing `CatalogAccessory` interface:

```typescript
// ─── Catalog V2 ──────────────────────────────────────────────────────────

export interface CatalogVariant {
  id: number
  group_id: number
  name: string
  qualifiers: string[]
  brands: string[]
  product_aliases: string[]
  optional_words: string[]
  regex_override: string | null
  estimated_new_price: number
  sort_order: number
  sort_order_manual: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CatalogGroup {
  id: number
  group_key: string
  model_id: number | null
  name: string
  category: string
  expressions: string[]
  default_price: number
  last_match_count: number
  created_at: string
  updated_at: string
  variants: CatalogVariant[]
}

export interface SynonymSuggestion {
  expression: string
  rule: 'prefix' | 'equivalence'
  context: string
}

export interface PreviewRegexResult {
  generated_regex: string
  matching_ads_count: number
  matching_ads_sample: Array<{ id: number; title: string; matched_text: string }>
}

export interface PreviewDiffResult {
  before: { matching_ads_count: number }
  after: { matching_ads_count: number }
  gained: Array<{ id: number; title: string }>
  lost: Array<{ id: number; title: string }>
}

export interface TestOnAdMatch {
  group: string
  group_key: string
  variant: string
  matched_text: string
}

export interface RefreshStatus {
  status: 'running' | 'idle' | 'error'
  updated_ads_count: number
  last_refresh: string | null
}
```

- [ ] **Step 2: Add catalog API functions**

```typescript
// ─── Catalog V2 API ──────────────────────────────────────────────────────

export function fetchCatalogGroups(): Promise<CatalogGroup[]> {
  return fetchJSON<CatalogGroup[]>('/catalog/groups')
}

export function fetchCatalogGroup(id: number): Promise<CatalogGroup> {
  return fetchJSON<CatalogGroup>(`/catalog/groups/${id}`)
}

export function createCatalogGroup(data: {
  name: string; category: string; expressions: string[]; default_price: number
}): Promise<CatalogGroup[]> {
  return fetchJSON('/catalog/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function updateCatalogGroup(id: number, data: Partial<{
  name: string; category: string; expressions: string[]; default_price: number
}>): Promise<{ id: number; name: string; status: string }> {
  return fetchJSON(`/catalog/groups/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function deleteCatalogGroup(id: number): Promise<{ deleted: number }> {
  return fetchJSON(`/catalog/groups/${id}`, { method: 'DELETE' })
}

export function createCatalogVariant(groupId: number, data: {
  name: string; qualifiers?: string[]; brands?: string[]; product_aliases?: string[]
  optional_words?: string[]; regex_override?: string | null
  estimated_new_price: number; sort_order?: number; notes?: string | null
}): Promise<{ id: number; name: string; status: string }> {
  return fetchJSON(`/catalog/groups/${groupId}/variants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function updateCatalogVariant(id: number, data: Partial<CatalogVariant>): Promise<{ id: number; name: string; status: string }> {
  return fetchJSON(`/catalog/variants/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function deleteCatalogVariant(id: number): Promise<{ deleted: number }> {
  return fetchJSON(`/catalog/variants/${id}`, { method: 'DELETE' })
}

export function suggestSynonyms(expression: string): Promise<{
  normalized: string; suggestions: SynonymSuggestion[]
}> {
  return fetchJSON('/catalog/suggest-synonyms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expression }),
  })
}

export function previewRegex(data: {
  group_expressions: string[]; qualifiers?: string[]; brands?: string[]
  product_aliases?: string[]; optional_words?: string[]; regex_override?: string | null
}): Promise<PreviewRegexResult> {
  return fetchJSON('/catalog/preview-regex', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function previewDiff(data: {
  variant_id: number; group_expressions: string[]; qualifiers?: string[]
  brands?: string[]; product_aliases?: string[]; optional_words?: string[]
  regex_override?: string | null
}): Promise<PreviewDiffResult> {
  return fetchJSON('/catalog/preview-diff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function testOnAd(data: { ad_id?: number; text?: string }): Promise<{ matches: TestOnAdMatch[] }> {
  return fetchJSON('/catalog/test-on-ad', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function resetCatalog(): Promise<{ status: string }> {
  return fetchJSON('/catalog/reset', { method: 'POST' })
}

export function exportCatalog(): Promise<{ groups: CatalogGroup[] }> {
  return fetchJSON('/catalog/export')
}

export function importCatalog(data: { groups: unknown[] }): Promise<{ status: string }> {
  return fetchJSON('/catalog/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function fetchRefreshStatus(): Promise<RefreshStatus> {
  return fetchJSON<RefreshStatus>('/catalog/refresh-status')
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "$(cat <<'EOF'
feat: frontend API client for catalog V2

Types and functions for catalog groups, variants, suggest-synonyms,
preview-regex, preview-diff, test-on-ad, reset, export, import.
EOF
)"
```

---

## Task 12: Frontend — TanStack Query hooks

**Files:**
- Modify: `frontend/src/hooks/queries.ts`

- [ ] **Step 1: Add catalog query hooks**

Add after the existing catalog hooks (replace `useAccessoryCatalog`, `useUpdateCatalogPrice`, `useResetCatalogPrice`):

```typescript
// ─── Catalog V2 ──────────────────────────────────────────────────────────

export function useCatalogGroups() {
  return useQuery({
    queryKey: ['catalog-groups'],
    queryFn: api.fetchCatalogGroups,
    staleTime: 30_000,
  })
}

export function useCatalogGroup(id: number) {
  return useQuery({
    queryKey: ['catalog-group', id],
    queryFn: () => api.fetchCatalogGroup(id),
    enabled: id > 0,
  })
}

export function useCreateCatalogGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createCatalogGroup,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalog-groups'] })
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useUpdateCatalogGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Parameters<typeof api.updateCatalogGroup>[1]) =>
      api.updateCatalogGroup(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalog-groups'] })
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useDeleteCatalogGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deleteCatalogGroup,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalog-groups'] })
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useCreateCatalogVariant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, ...data }: { groupId: number } & Parameters<typeof api.createCatalogVariant>[1]) =>
      api.createCatalogVariant(groupId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalog-groups'] })
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useUpdateCatalogVariant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<api.CatalogVariant>) =>
      api.updateCatalogVariant(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalog-groups'] })
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useDeleteCatalogVariant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deleteCatalogVariant,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalog-groups'] })
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useSuggestSynonyms() {
  return useMutation({
    mutationFn: api.suggestSynonyms,
  })
}

export function usePreviewRegex() {
  return useMutation({
    mutationFn: api.previewRegex,
  })
}

export function usePreviewDiff() {
  return useMutation({
    mutationFn: api.previewDiff,
  })
}

export function useTestOnAd() {
  return useMutation({
    mutationFn: api.testOnAd,
  })
}

export function useResetCatalog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.resetCatalog,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalog-groups'] })
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useExportCatalog() {
  return useMutation({
    mutationFn: api.exportCatalog,
  })
}

export function useImportCatalog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.importCatalog,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalog-groups'] })
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
    },
  })
}

export function useRefreshStatus() {
  return useQuery({
    queryKey: ['refresh-status'],
    queryFn: api.fetchRefreshStatus,
    refetchInterval: (query) => {
      const data = query.state.data
      return data?.status === 'running' ? 2000 : false
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/queries.ts
git commit -m "$(cat <<'EOF'
feat: TanStack Query hooks for catalog V2

Hooks for all catalog operations: CRUD groups/variants, suggest,
preview, diff, test, reset, export, import, refresh status polling.
EOF
)"
```

---

## Task 13: Frontend — i18n translations

**Files:**
- Modify: `frontend/src/i18n/locales/fr.json`
- Modify: `frontend/src/i18n/locales/en.json`

- [ ] **Step 1: Add French catalog translations**

Add/update the `catalog` section in `fr.json`:

```json
"catalog": {
  "title": "Catalogue accessoires",
  "description": "Gerez les accessoires detectes automatiquement dans les annonces.",
  "recalculate": "Recalculer les accessoires",
  "recalculated": "{{refreshed}} annonces recalculees",
  "recalculatedWithSkipped": "{{refreshed}} annonces recalculees ({{skipped}} ignorees car modifiees manuellement)",
  "accessory_one": "{{count}} accessoire",
  "accessory_other": "{{count}} accessoires",
  "variant_one": "{{count}} declinaison",
  "variant_other": "{{count}} declinaisons",
  "matches_one": "{{count}} annonce detectee",
  "matches_other": "{{count}} annonces detectees",
  "createGroup": "Nouvel accessoire",
  "editGroup": "Modifier l'accessoire",
  "deleteGroup": "Supprimer l'accessoire",
  "deleteGroupConfirm": "Supprimer « {{name}} » et ses {{count}} declinaisons ?",
  "createVariant": "Nouvelle declinaison",
  "editVariant": "Modifier la declinaison",
  "deleteVariant": "Supprimer la declinaison",
  "groupName": "Nom de l'accessoire",
  "category": "Categorie",
  "defaultPrice": "Prix neuf par defaut",
  "synonyms": "Synonymes",
  "synonymsHelp": "Differentes facons de nommer cet accessoire",
  "addSynonym": "Ajouter un synonyme",
  "mainExpression": "Terme principal",
  "suggestions": "Suggestions",
  "suggestionsPrefix": "Prefixes interchangeables",
  "suggestionsEquivalence": "Equivalences domaine",
  "veryLikely": "tres probable",
  "possible": "possible",
  "variantName": "Nom de la declinaison",
  "keywords": "Mots-cles",
  "keywordsHelp": "Qualificatifs (ex: alu, rally, touring)",
  "brands": "Marques",
  "brandsHelp": "Fabricants (ex: SW-Motech, Givi)",
  "productNames": "Noms de produits",
  "productNamesHelp": "Noms specifiques (ex: Alaska Trekker, Quad Lock)",
  "newPrice": "Prix neuf",
  "preview": "Apercu",
  "previewRegex": "Regex generee",
  "matchingAds": "Annonces detectees",
  "previewDiff": "Impact de la modification",
  "gained": "Nouvelles detections",
  "lost": "Detections perdues",
  "lostWarning": "Attention : {{count}} annonces ne seront plus detectees",
  "advanced": "Mode avance",
  "optionalWords": "Mots intercalables",
  "optionalWordsHelp": "Mots qui peuvent s'inserer (ex: de, du)",
  "regexOverride": "Regex manuelle",
  "regexOverrideHelp": "Remplace la regex generee. Reservee aux cas complexes",
  "notes": "Notes",
  "notesHelp": "Documentation libre (non utilise par la detection)",
  "testOnAd": "Tester sur une annonce",
  "testOnAdPlaceholder": "ID d'annonce ou texte libre...",
  "testResults": "Resultats du test",
  "noTestResults": "Aucun accessoire detecte",
  "reset": "Reinitialiser le catalogue",
  "resetConfirm": "Reinitialiser aux valeurs par defaut ?",
  "resetDescription": "Ceci remplacera vos {{count}} accessoires personnalises.",
  "resetExportFirst": "Exporter puis reinitialiser",
  "resetDirect": "Reinitialiser sans exporter",
  "resetDone": "Catalogue reinitialise",
  "exportCatalog": "Exporter le catalogue",
  "importCatalog": "Importer un catalogue",
  "refreshing": "Mise a jour en cours...",
  "refreshIdle": "A jour",
  "refreshError": "Erreur de mise a jour",
  "refreshDone": "{{count}} annonces mises a jour",
  "saving": "Enregistrement...",
  "deleting": "Suppression...",
  "testing": "Test en cours...",
  "nameRequired": "Le nom est obligatoire",
  "expressionRequired": "Au moins un synonyme est requis",
  "priceRequired": "Le prix neuf est obligatoire",
  "invalidRegex": "Regex invalide : {{error}}",
  "duplicateGroup": "Un accessoire avec ce nom existe deja",
  "emptyTitle": "Aucun accessoire",
  "emptyDescription": "Le catalogue est vide. Cliquez sur « Nouvel accessoire » ou reinitialiser aux valeurs par defaut.",
  "suggestError": "Impossible de charger les suggestions",
  "suggestRetry": "Reessayer",
  "resetTypeConfirm": "Tapez RESET pour confirmer",
  "deleteVariantConfirm": "Supprimer la declinaison « {{name}} » ?",
  "deleteVariantLastWarning": "C'est la derniere declinaison du groupe. Le groupe restera sans declinaison.",
  "regexTimeout": "Regex trop lente : timeout sur {{count}} annonce(s)",
  "categories": {
    "protection": "Protection",
    "bagagerie": "Bagagerie",
    "confort": "Confort",
    "navigation": "Navigation",
    "eclairage": "Eclairage",
    "esthetique": "Esthetique",
    "performance": "Performance",
    "autre": "Autre"
  },
  "categoryDescriptions": {
    "protection": "Crash bars, sabot moteur, protege-mains...",
    "bagagerie": "Top case, sacoches, porte-bagages...",
    "confort": "Selle, bulle, poignees chauffantes...",
    "navigation": "GPS, support telephone...",
    "eclairage": "Feux additionnels, phare LED...",
    "esthetique": "Retros, garde-boue, stickers...",
    "performance": "Echappement, filtre a air, reprog...",
    "autre": "Antivol, bequille centrale, housse..."
  }
}
```

- [ ] **Step 2: Add English catalog translations**

Same structure in `en.json`:

```json
"catalog": {
  "title": "Accessory catalog",
  "description": "Manage accessories automatically detected in listings.",
  "recalculate": "Recalculate accessories",
  "recalculated": "{{refreshed}} listings recalculated",
  "recalculatedWithSkipped": "{{refreshed}} listings recalculated ({{skipped}} skipped — manually edited)",
  "accessory_one": "{{count}} accessory",
  "accessory_other": "{{count}} accessories",
  "variant_one": "{{count}} variant",
  "variant_other": "{{count}} variants",
  "matches_one": "{{count}} listing detected",
  "matches_other": "{{count}} listings detected",
  "createGroup": "New accessory",
  "editGroup": "Edit accessory",
  "deleteGroup": "Delete accessory",
  "deleteGroupConfirm": "Delete \"{{name}}\" and its {{count}} variants?",
  "createVariant": "New variant",
  "editVariant": "Edit variant",
  "deleteVariant": "Delete variant",
  "groupName": "Accessory name",
  "category": "Category",
  "defaultPrice": "Default new price",
  "synonyms": "Synonyms",
  "synonymsHelp": "Different ways to name this accessory",
  "addSynonym": "Add a synonym",
  "mainExpression": "Main term",
  "suggestions": "Suggestions",
  "suggestionsPrefix": "Interchangeable prefixes",
  "suggestionsEquivalence": "Domain equivalences",
  "veryLikely": "very likely",
  "possible": "possible",
  "variantName": "Variant name",
  "keywords": "Keywords",
  "keywordsHelp": "Qualifiers (e.g., alu, rally, touring)",
  "brands": "Brands",
  "brandsHelp": "Manufacturers (e.g., SW-Motech, Givi)",
  "productNames": "Product names",
  "productNamesHelp": "Specific names (e.g., Alaska Trekker, Quad Lock)",
  "newPrice": "New price",
  "preview": "Preview",
  "previewRegex": "Generated regex",
  "matchingAds": "Matching listings",
  "previewDiff": "Modification impact",
  "gained": "New detections",
  "lost": "Lost detections",
  "lostWarning": "Warning: {{count}} listings will no longer be detected",
  "advanced": "Advanced mode",
  "optionalWords": "Optional words",
  "optionalWordsHelp": "Words that may appear between terms (e.g., de, du)",
  "regexOverride": "Manual regex",
  "regexOverrideHelp": "Overrides generated regex. For complex cases only",
  "notes": "Notes",
  "notesHelp": "Free-form documentation (not used by detection)",
  "testOnAd": "Test on a listing",
  "testOnAdPlaceholder": "Listing ID or free text...",
  "testResults": "Test results",
  "noTestResults": "No accessories detected",
  "reset": "Reset catalog",
  "resetConfirm": "Reset to default values?",
  "resetDescription": "This will replace your {{count}} custom accessories.",
  "resetExportFirst": "Export then reset",
  "resetDirect": "Reset without exporting",
  "resetDone": "Catalog reset complete",
  "exportCatalog": "Export catalog",
  "importCatalog": "Import catalog",
  "refreshing": "Updating...",
  "refreshIdle": "Up to date",
  "refreshError": "Update error",
  "refreshDone": "{{count}} listings updated",
  "saving": "Saving...",
  "deleting": "Deleting...",
  "testing": "Testing...",
  "nameRequired": "Name is required",
  "expressionRequired": "At least one synonym is required",
  "priceRequired": "New price is required",
  "invalidRegex": "Invalid regex: {{error}}",
  "duplicateGroup": "An accessory with this name already exists",
  "emptyTitle": "No accessories",
  "emptyDescription": "The catalog is empty. Click \"New accessory\" or reset to defaults.",
  "suggestError": "Could not load suggestions",
  "suggestRetry": "Retry",
  "resetTypeConfirm": "Type RESET to confirm",
  "deleteVariantConfirm": "Delete variant \"{{name}}\"?",
  "deleteVariantLastWarning": "This is the last variant in the group. The group will remain without variants.",
  "regexTimeout": "Regex too slow: timed out on {{count}} listing(s)",
  "categories": {
    "protection": "Protection",
    "bagagerie": "Luggage",
    "confort": "Comfort",
    "navigation": "Navigation",
    "eclairage": "Lighting",
    "esthetique": "Aesthetics",
    "performance": "Performance",
    "autre": "Other"
  },
  "categoryDescriptions": {
    "protection": "Crash bars, skid plate, hand guards...",
    "bagagerie": "Top case, panniers, luggage rack...",
    "confort": "Seat, windscreen, heated grips...",
    "navigation": "GPS, phone mount...",
    "eclairage": "Auxiliary lights, LED headlight...",
    "esthetique": "Mirrors, fender, stickers...",
    "performance": "Exhaust, air filter, ECU flash...",
    "autre": "Lock, center stand, cover..."
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/i18n/locales/
git commit -m "$(cat <<'EOF'
feat: i18n translations for catalog V2 (FR + EN)

Full translation keys for catalog management UI including
groups, variants, suggestions, preview, diff, test, reset.
EOF
)"
```

---

## Task 14: Frontend — CatalogPage rewrite

**Files:**
- Modify: `frontend/src/pages/CatalogPage.tsx`
- Create: `frontend/src/components/CatalogGroupForm.tsx`
- Create: `frontend/src/components/CatalogVariantForm.tsx`
- Create: `frontend/src/components/CatalogTestOnAd.tsx`
- Create: `frontend/src/components/CatalogResetModal.tsx`

This is the largest task. Read existing UI patterns before writing code.

**Required context to read first:**
- `frontend/src/pages/CatalogPage.tsx` — current implementation to understand existing structure
- `frontend/src/components/AdForm.tsx` — reference for form patterns (tag inputs, card sections, inline labels)
- `frontend/src/components/AdDetail.tsx` — reference for expandable sections and badge styling
- `frontend/src/hooks/queries.ts` — verify hook signatures match what you'll call
- The spec's "Flow UI revise" section (lines 954-1005) is the source of truth for the UI flow

**Design constraints:**
- Use existing component patterns (no new UI libraries)
- All visible strings via `t()` calls using keys from Task 13
- Debounce preview calls (300ms) to avoid hammering the API on every keystroke
- Tag inputs for qualifiers/brands/aliases: reuse the chip/badge pattern from `AdForm.tsx` accessory list
- Use `framer-motion` for expand/collapse animations (existing pattern)
- Category select: show description under each option (use the `categoryDescriptions` i18n keys)

**UX rules (from review):**
- **All mutation buttons** (Save, Delete, Reset) must show `isPending` spinner + disabled state during mutation — follow existing `Button` + `isPending` pattern from `AdForm.tsx`
- **Preview vs Diff**: for NEW variants, show `preview-regex` (matching count + sample). For EXISTING variants, show `preview-diff` (before/after + gained/lost). Both panels can coexist: diff panel above, regex panel below
- **Synonym suggestions error**: if `suggest-synonyms` API fails, show inline error with retry link. The "Add manually" link must always be accessible regardless
- **Test on ad**: show a loading spinner during test. Support Enter to submit, Escape to clear
- **Variant deletion**: show confirmation dialog with variant name. If it's the last variant in the group, warn explicitly
- **Refresh badge**: after refresh completes, show transient "X annonces mises a jour" for 5 seconds before returning to "A jour". Use `updated_ads_count` from `refresh-status` response
- **Synonym checkboxes**: pre-check items with rule "prefix" (tres probable). Leave items with rule "equivalence" (possible) unchecked by default. Visual hierarchy: prefix items first with full opacity, equivalence items second with reduced opacity
- **Import catalog**: add a simple file input (JSON) next to the Export button. On file select, validate JSON structure, show confirmation with group count, then call `importCatalog`

**Key implementation guidance:**

- [ ] **Step 1: Create CatalogResetModal.tsx**

A modal (using `@radix-ui/react-dialog` pattern from existing code) with:
- Confirmation text showing number of custom groups
- "Export then reset" button that calls `useExportCatalog` then `useResetCatalog`
- "Reset without exporting" button with text confirmation (type "RESET")
- Use existing `Button` component variants (danger for reset)

- [ ] **Step 2: Create CatalogTestOnAd.tsx**

A search input (text field) at the top of the catalog page:
- Accept either a numeric ad ID or free text
- On submit, call `useTestOnAd` mutation
- Display results as a list of matched accessories with group, variant, and highlighted text
- Use existing search input pattern from `AdForm.tsx` (lines 386-413)
- Show `t('catalog.noTestResults')` if no matches

- [ ] **Step 3: Create CatalogGroupForm.tsx**

A form component for creating/editing groups (unified group + first variant):
- Props: `group?: CatalogGroup` (if editing), `onClose: () => void`
- Section 1 "Accessoire": name, category (Select with descriptions), default price
- Section 1b "Synonymes": main expression input → call `useSuggestSynonyms` on blur → show suggestions with checkboxes → "Add manually" link
- Section 2 "Premiere declinaison" (collapsible, expanded by default on create): variant name, keywords (tag input), brands (tag input), product names (tag input), new price
- Collapsible "Mode avance": optional words (tag input), regex override (text input), notes (textarea)
- Preview section: call `usePreviewRegex` when form fields change (debounced) → show matching count + sample
- If editing existing variant, call `usePreviewDiff` instead → show diff (gained/lost) with warning if lost > 0
- Save button → calls `useCreateCatalogGroup` + `useCreateCatalogVariant` or `useUpdateCatalogGroup` + `useUpdateCatalogVariant`
- Use existing form patterns: Card sections, inline labels, Tailwind styling

- [ ] **Step 4: Create CatalogVariantForm.tsx**

A form for adding/editing a variant within an existing group:
- Props: `groupId: number, group: CatalogGroup, variant?: CatalogVariant, onClose: () => void`
- Same fields as the variant section in CatalogGroupForm
- Same preview/diff behavior
- Save → `useCreateCatalogVariant` or `useUpdateCatalogVariant`

- [ ] **Step 5: Rewrite CatalogPage.tsx**

Replace the current flat list with a grouped, interactive catalog:
- Header: title, description, refresh status badge (use `useRefreshStatus`), buttons row: "Recalculate" + "Reset" (opens CatalogResetModal) + "New accessory" (opens CatalogGroupForm)
- Test on ad section: `CatalogTestOnAd` component
- Group list: iterate `CATEGORY_ORDER`, for each category show a Card with:
  - Category badge + count
  - For each group in category:
    - Row: group name, expressions as small badges, `last_match_count` badge, edit/delete buttons
    - Expandable section: variants list
      - Each variant: name, qualifiers/brands as small badges, price, edit/delete buttons
    - "Add variant" button at bottom
- Loading state: skeleton cards (existing pattern)
- Empty state: message if no groups

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/CatalogPage.tsx frontend/src/components/Catalog*.tsx
git commit -m "$(cat <<'EOF'
feat: rewrite CatalogPage with full CRUD UI

- Group list with health indicators (match count)
- Unified group + variant creation form
- Synonym suggestions with checkboxes
- Preview regex with matching ads count
- Preview diff (before/after) for edits
- Test on ad (by ID or free text)
- Reset with export modal
- Refresh status indicator
- i18n for all strings
EOF
)"
```

---

## Task 15: Cleanup — remove old system

**Files:**
- Modify: `src/accessories.py`
- Modify: `src/api.py`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/hooks/queries.ts`

- [ ] **Step 1: Remove ACCESSORY_PATTERNS from accessories.py**

Delete lines 26-328 (the entire `ACCESSORY_PATTERNS` list and its comments). Keep `DEPRECIATION_RATE`, `EXCLUSION_PATTERNS`, the functions.

Update `detect_accessories` to remove the fallback to `ACCESSORY_PATTERNS` AND remove the dead `price_overrides` parameter (prices are now embedded in catalog patterns):

```python
def detect_accessories(
    text: str,
    patterns: list[tuple[str, str, str, int, str]] | None = None,
) -> list[dict]:
    """
    Detecte les accessoires mentionnes dans un texte d'annonce.

    Args:
        text: Le body ou la description de l'annonce.
        patterns: Liste de (regex, nom, categorie, prix_neuf, groupe_dedup).
    """
    if not text or not patterns:
        return []

    text_lower = _clean_text_for_detection(text)
    matched_groups: set[str] = set()
    found: list[dict] = []

    for pattern, name, category, price_new, group in patterns:
        if group in matched_groups:
            continue
        if re.search(pattern, text_lower):
            matched_groups.add(group)
            found.append({
                "name": name,
                "category": category,
                "source": "body",
                "estimated_new_price": price_new,
                "estimated_used_price": int(price_new * DEPRECIATION_RATE),
            })

    return found
```

Also update all call sites to remove the `price_overrides` argument:
- `src/extractor.py`: `detect_accessories(body, patterns=catalog_patterns)` (already done in Task 6)
- `src/database.py`: `detect_accessories(ad.body or "", patterns=patterns)` (already correct in Task 7)
- `src/api.py`: any remaining calls

- [ ] **Step 2: Remove old API endpoints and imports**

In `src/api.py`:
- Remove the 3 deprecated endpoint stubs (`GET /api/accessory-catalog`, `PATCH /api/accessory-catalog/{group}`, `DELETE /api/accessory-catalog/{group}/override`)
- Remove `UpdateCatalogPriceRequest` class
- Remove `AccessoryOverride` from model imports
- Remove any remaining references to `get_accessory_overrides`, `set_accessory_override`, `delete_accessory_override`

- [ ] **Step 3: Remove old frontend API functions and hooks**

In `frontend/src/lib/api.ts`:
- Remove `CatalogAccessory` interface
- Remove `fetchAccessoryCatalog`, `updateCatalogPrice`, `resetCatalogPrice` functions

In `frontend/src/hooks/queries.ts`:
- Remove `useAccessoryCatalog`, `useUpdateCatalogPrice`, `useResetCatalogPrice` hooks

- [ ] **Step 4: Commit**

```bash
git add src/accessories.py src/api.py frontend/src/lib/api.ts frontend/src/hooks/queries.ts
git commit -m "$(cat <<'EOF'
refactor: remove old accessory catalog system

- Remove ACCESSORY_PATTERNS from accessories.py
- Remove old API endpoints (accessory-catalog)
- Remove old frontend API client and hooks
EOF
)"
```

---

## Task 15b: Adapt AdForm.tsx to new catalog API

**Files:**
- Modify: `frontend/src/components/AdForm.tsx`

This is a functional change (the accessory picker switches data source) that should be tested independently from the cleanup.

- [ ] **Step 1: Update AdForm.tsx to use new catalog API**

In `frontend/src/components/AdForm.tsx`, update the catalog loading to use `useCatalogGroups` instead of `useAccessoryCatalog`. The accessory list in the form should be built from catalog groups' variants:

```typescript
const { data: catalogGroups } = useCatalogGroups()

// Flatten catalog groups into a flat list for the accessory picker
const catalogItems = catalogGroups?.flatMap(g =>
  g.variants.map(v => ({
    name: v.name,
    category: g.category,
    estimated_new_price: v.estimated_new_price,
    estimated_used_price: Math.round(v.estimated_new_price * 0.65),
    group: g.group_key,
  }))
) ?? []
```

Replace all references to `useAccessoryCatalog` / `catalogAccessories` with the new `useCatalogGroups` / `catalogItems`. Verify that:
- The accessory autocomplete/picker still works
- The selected accessories display correctly
- Saving an ad with modified accessories works

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/AdForm.tsx
git commit -m "$(cat <<'EOF'
feat: adapt AdForm accessory picker to catalog V2

Switch from useAccessoryCatalog to useCatalogGroups.
Flatten groups+variants into the same format for the picker.
EOF
)"
```

---

## Task 16: Migration to drop accessory_overrides table

**Files:**
- Create: `alembic/versions/XXXX_drop_accessory_overrides.py`
- Modify: `src/models.py`
- Modify: `src/database.py`
- Modify: `alembic/env.py`

- [ ] **Step 1: Generate migration to drop the table**

```bash
alembic revision -m "drop accessory_overrides table"
```

Edit the generated file:

```python
"""drop accessory_overrides table"""

from alembic import op
import sqlalchemy as sa

revision = '<GENERATED>'
down_revision = '<PREVIOUS>'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("accessory_overrides")


def downgrade() -> None:
    op.create_table(
        "accessory_overrides",
        sa.Column("group_key", sa.String(), primary_key=True),
        sa.Column("estimated_new_price", sa.Integer(), nullable=False),
    )
```

- [ ] **Step 2: Remove AccessoryOverride model from models.py**

Delete the `AccessoryOverride` class (lines 172-176).

- [ ] **Step 3: Remove AccessoryOverride from database.py imports and functions**

Remove `AccessoryOverride` from the import line. Remove `get_accessory_overrides`, `set_accessory_override`, `delete_accessory_override` functions.

- [ ] **Step 4: Remove AccessoryOverride from alembic/env.py imports**

Update the import to remove `AccessoryOverride`:

```python
from src.models import (  # noqa: F401
    Ad, AdAttribute, AdImage, AdAccessory,
    CrawlSession, CrawlSessionAd, AdPriceHistory,
    AccessoryCatalogGroup, AccessoryCatalogVariant,
)
```

- [ ] **Step 5: Apply migration**

```bash
alembic upgrade head
```

- [ ] **Step 6: Commit**

```bash
git add alembic/ src/models.py src/database.py
git commit -m "$(cat <<'EOF'
refactor: drop accessory_overrides table

Price overrides are now stored directly in catalog variant prices.
EOF
)"
```

---

## Task 17: Validation — end-to-end test

**Files:** None (verification only)

- [ ] **Step 1: Start the dev environment**

```bash
source .venv/bin/activate
make dev
```

- [ ] **Step 2: Verify catalog API**

```bash
# List groups
curl -s http://localhost:8000/api/catalog/groups | python -m json.tool | head -30

# Suggest synonyms
curl -s -X POST http://localhost:8000/api/catalog/suggest-synonyms \
  -H 'Content-Type: application/json' \
  -d '{"expression": "protege-radiateur"}' | python -m json.tool

# Preview regex
curl -s -X POST http://localhost:8000/api/catalog/preview-regex \
  -H 'Content-Type: application/json' \
  -d '{"group_expressions": ["pare-mains", "protege-mains"], "brands": ["sw-motech"]}' | python -m json.tool

# Test on ad (use an existing ad ID from the database)
curl -s -X POST http://localhost:8000/api/catalog/test-on-ad \
  -H 'Content-Type: application/json' \
  -d '{"text": "himalayan 450 avec crash bars sw-motech et top case givi alaska"}' | python -m json.tool

# Refresh status
curl -s http://localhost:8000/api/catalog/refresh-status | python -m json.tool
```

- [ ] **Step 3: Verify no regressions**

Run the ranking to check accessory detection still works:

```bash
python -m src.analyzer
```

Compare the output with the previous ranking. The accessory counts and prices should be identical (same detection behavior).

- [ ] **Step 4: Verify frontend**

Open `http://localhost:5173/catalog` (or the auto-detected port) and verify:
- Group list loads with categories
- Each group shows match count
- Can create a new group with synonym suggestions
- Can add a variant with preview
- Can edit an existing group/variant with diff
- Test on ad works
- Reset with export works

- [ ] **Step 5: Commit any fixes**

If any issues found during validation, fix and commit.

---

## Task 18: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update architecture section**

Add `src/catalog.py` to the architecture description:

```markdown
- `src/catalog.py` — Regex compiler and synonym engine. Pure domain logic (no DB dependency). Compiles structured catalog data (expressions, qualifiers, brands, aliases) into regex patterns. Provides synonym suggestions via prefix rules and domain equivalences. `build_patterns_from_catalog()` outputs the same format as the old `ACCESSORY_PATTERNS`
```

Update the `src/accessories.py` description:

```markdown
- `src/accessories.py` — Accessory detection and valuation. `detect_accessories()` takes patterns from `catalog.py` (built from DB catalog). `DEPRECIATION_RATE = 0.65`. `EXCLUSION_PATTERNS` strips garage service text. Unicode normalization (strip accents) applied before matching
```

- [ ] **Step 2: Update key design patterns**

Add:

```markdown
- **Editable catalog**: Accessory patterns stored in DB tables (`accessory_catalog_groups`, `accessory_catalog_variants`). A regex compiler in `catalog.py` generates patterns from structured fields. Seed data in `alembic/seed_accessory_catalog.json` provides default catalog with "Reset" button
- **Catalog cache**: In-memory dict cache (`_catalog_cache`) invalidated on every catalog write. Single-worker deployment required (no shared cache)
- **Crosscheck workflow**: Ads flagged `needs_crosscheck=1` can be analyzed by Claude Code in terminal to discover accessories not covered by the catalog
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: update CLAUDE.md with catalog architecture

Add catalog.py, update accessories.py description,
document editable catalog and crosscheck patterns.
EOF
)"
```
