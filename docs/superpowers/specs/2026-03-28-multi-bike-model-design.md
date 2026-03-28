# Multi-Bike Model Migration — Design Spec

**Date:** 2026-03-28
**Status:** Draft

## Overview

Migrate BikeBargain from a single-bike app (Himalayan 450) to a multi-brand motorcycle marketplace. Any bike model from any brand can be added by an admin, each with its own accessory catalog, variant pricing, analyzer constants, and crawler search config. Users pick a bike model from a landing page and work within that model's context.

## Decisions

- **Multi-brand** — any motorcycle brand, not just Royal Enfield
- **Admin-curated catalog** — bike models configured by admin, with a path toward future user customization
- **Bike model as top-level context** — user picks a model first, all views scoped to it
- **Card grid landing page** — visual cards showing brand, name, ad count, price range
- **All config in database** — accessories, variants, consumables, analyzer constants, search config
- **Flexible variant detection** — per-model regex patterns in DB
- **Multi-keyword search** — multiple search keyword sets per model
- **Duplicate detection scoped to model** — same algorithm, no threshold changes
- **Auto-migrate existing data** — Himalayan 450 becomes bike model ID 1, all existing ads assigned to it
- **Keep "BikeBargain" name**
- **Big bang spec** — one coherent migration across all layers

## Data Model

### New Tables

#### `bike_model`

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | Auto-increment |
| `slug` | String, unique | URL-friendly identifier (e.g., `himalayan-450`) |
| `brand` | String | e.g., "Royal Enfield", "KTM" |
| `name` | String | e.g., "Himalayan 450", "890 Adventure" |
| `engine_cc` | Integer | Engine displacement |
| `image_url` | String, nullable | Bike photo for landing page card |
| `active` | Boolean | Whether model appears on landing page |
| `created_at` | DateTime | Auto-set |

#### `bike_model_config`

One-to-one with `bike_model`. Stores analyzer tuning constants.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `bike_model_id` | FK → bike_model, unique | One config per model |
| `warranty_years` | Integer | e.g., 3 for Himalayan |
| `warranty_value_per_year` | Integer | EUR, e.g., 200 |
| `mechanical_wear_per_km` | Float | e.g., 0.03 |
| `condition_risk_per_km` | Float | e.g., 0.04 |
| `short_term_km_threshold` | Integer | e.g., 3000 |

#### `bike_variant`

Variant/color/price catalog per model.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `bike_model_id` | FK → bike_model | |
| `variant_name` | String | e.g., "Base", "Summit" |
| `color` | String | e.g., "Kaza Brown" |
| `wheel_type` | String, nullable | e.g., "standard", "tubeless". Nullable for bikes without wheel options |
| `new_price` | Integer | EUR |

Unique constraint on `(bike_model_id, variant_name, color, wheel_type)`.

#### `bike_consumable`

Wear items for the analyzer.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `bike_model_id` | FK → bike_model | |
| `name` | String | e.g., "Pneus (AV+AR)" |
| `cost_eur` | Integer | Garage replacement cost |
| `life_km` | Integer | Expected lifespan in km |

#### `bike_accessory_pattern`

Accessory detection regex patterns per model.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `bike_model_id` | FK → bike_model | |
| `regex_pattern` | String | Python regex |
| `name` | String | Display name, e.g., "Crash bars SW-Motech" |
| `category` | String | One of: protection, bagagerie, confort, navigation, eclairage, esthetique, performance, autre |
| `new_price` | Integer | EUR estimated new price |
| `depreciation_rate` | Float | e.g., 0.65 |
| `dedup_group` | String, nullable | First match wins within group |
| `sort_order` | Integer | Controls matching order — lower values matched first |

Index on `(bike_model_id, sort_order)`.

#### `bike_variant_pattern`

Regex patterns for detecting variant from ad text.

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `bike_model_id` | FK → bike_model | |
| `regex_pattern` | String | Python regex matched against title + body |
| `matched_variant` | String | Variant name to assign on match |
| `priority` | Integer | Higher priority checked first |

#### `bike_exclusion_pattern`

Patterns to strip from ad text before accessory detection (e.g., garage service descriptions).

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `bike_model_id` | FK → bike_model | |
| `regex_pattern` | String | Python regex |

#### `bike_search_config`

Crawler search parameters. Multiple rows per model (one per keyword variant).

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `bike_model_id` | FK → bike_model | |
| `keyword` | String | Search term, e.g., "KTM 890 Adventure" |
| `min_cc` | Integer | Minimum engine CC filter |
| `max_cc` | Integer | Maximum engine CC filter |

### Modified Tables

#### `ad`

- Add `bike_model_id` (FK → `bike_model`, non-nullable after migration)
- Add index on `(bike_model_id, variant)`
- Add index on `(bike_model_id, price)`

#### `crawl_session`

- Add `bike_model_id` (FK → `bike_model`, non-nullable after migration)

#### `accessory_override`

- Add `bike_model_id` (FK → `bike_model`) to scope overrides per model

## API

### New Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/bike-models` | GET | List active bike models with summary stats (ad count, price range) for landing page |
| `GET /api/bike-models/{slug}` | GET | Single model detail including config |
| `GET /api/bike-models/{slug}/variants` | GET | Variant/color/wheel catalog for dropdowns |
| `GET /api/bike-models/{slug}/accessories` | GET | Accessory pattern catalog |
| `POST /api/bike-models` | POST | Create new bike model (admin) |
| `PATCH /api/bike-models/{slug}` | PATCH | Update model metadata (admin) |
| `PUT /api/bike-models/{slug}/config` | PUT | Set analyzer config (admin) |
| `POST /api/bike-models/{slug}/variants` | POST | Add variant (admin) |
| `DELETE /api/bike-models/{slug}/variants/{id}` | DELETE | Remove variant (admin) |
| `POST /api/bike-models/{slug}/accessories` | POST | Add accessory pattern (admin) |
| `PATCH /api/bike-models/{slug}/accessories/{id}` | PATCH | Update accessory pattern (admin) |
| `DELETE /api/bike-models/{slug}/accessories/{id}` | DELETE | Remove accessory pattern (admin) |
| `POST /api/bike-models/{slug}/search-configs` | POST | Add search keyword (admin) |
| `POST /api/bike-models/{slug}/variant-patterns` | POST | Add variant detection pattern (admin) |

### Modified Endpoints — Scoped Under Model

All existing ad-related endpoints move under `/api/bike-models/{slug}/`:

| Current | Becomes |
|---------|---------|
| `GET /api/ads` | `GET /api/bike-models/{slug}/ads` |
| `GET /api/ads/{id}` | `GET /api/bike-models/{slug}/ads/{id}` |
| `POST /api/ads/preview` | `POST /api/bike-models/{slug}/ads/preview` |
| `POST /api/ads/confirm` | `POST /api/bike-models/{slug}/ads/confirm` |
| `PATCH /api/ads/{id}` | `PATCH /api/bike-models/{slug}/ads/{id}` |
| `DELETE /api/ads/{id}` | `DELETE /api/bike-models/{slug}/ads/{id}` |
| `POST /api/ads/merge` | `POST /api/bike-models/{slug}/ads/merge` |
| `GET /api/ads/{id}/price-history` | `GET /api/bike-models/{slug}/ads/{id}/price-history` |
| `POST /api/ads/check-online` | `POST /api/bike-models/{slug}/ads/check-online` |
| `GET /api/stats` | `GET /api/bike-models/{slug}/stats` |
| `GET /api/rankings` | `GET /api/bike-models/{slug}/rankings` |
| `GET /api/catalog` | `GET /api/bike-models/{slug}/catalog` |
| `POST /api/crawl/...` | `POST /api/bike-models/{slug}/crawl/...` |
| `GET /api/export` | `GET /api/bike-models/{slug}/export` |

The slug is resolved to `bike_model_id` via a shared FastAPI dependency (`get_bike_model_by_slug()`).

Admin endpoints have no authentication for now (same as the rest of the app). Auth is a future concern.

## Backend Refactor

### `src/extractor.py`

- Remove `NEW_PRICES`, `VARIANT_PATTERNS`, `NEW_LISTING_PATTERNS` constants
- `fetch_ad(url, bike_model_id, session)` — takes `bike_model_id` to load the right patterns
- `_detect_variant(subject, body, attributes, bike_model_id, session)` — loads `BikeVariantPattern` rows from DB, matches in priority order
- `_estimate_new_price(bike_model_id, variant, color, wheel_type, session)` — looks up `BikeVariant` table
- `detect_new_listing()` / `detect_new_listing_light()` — compare price against model's `BikeVariant` catalog prices

### `src/accessories.py`

- Remove `ACCESSORY_PATTERNS` constant (328 patterns) and `EXCLUSION_PATTERNS`
- `detect_accessories(text, bike_model_id, session)` — loads `BikeAccessoryPattern` rows from DB ordered by `sort_order`, applies regex matching with dedup group logic
- `compute_used_value()` — reads `depreciation_rate` from each pattern's DB row instead of global 0.65
- Exclusion patterns loaded from `BikeExclusionPattern` table
- Regex matching engine and dedup group logic stay unchanged

### `src/analyzer.py`

- Remove `WARRANTY_DURATION_YEARS`, `WARRANTY_VALUE_PER_YEAR`, `CONSUMABLES`, `MECHANICAL_WEAR_PER_KM`, `CONDITION_RISK_PER_KM`, `SHORT_TERM_KM_THRESHOLD` constants
- `compute_consumable_wear(mileage, bike_model_id, session)` — loads `BikeConsumable` rows from DB
- `compute_warranty(year, bike_model_id, session)` — reads from `BikeModelConfig`
- `rank_ads(bike_model_id, session)` — loads model config for wear coefficients, filters ads by model

### `src/crawler.py`

- Remove `SEARCH_TEXT`, `SEARCH_CC_MIN`, `SEARCH_CC_MAX` constants
- `search_all_ads(bike_model_id, session)` — loads `BikeSearchConfig` rows (multiple keywords per model), runs a search for each keyword, deduplicates results by LBC ad ID

### `src/database.py`

- Add `bike_model_id` to `_AD_FIELDS`
- Add CRUD functions for new tables: `get_bike_model()`, `get_bike_models()`, `get_bike_model_by_slug()`, etc.
- `upsert_ad()` takes `bike_model_id`

### `src/models.py`

- New SQLModel classes for all new tables with proper relationships
- FK on `Ad.bike_model_id`, `CrawlSession.bike_model_id`, `AccessoryOverride.bike_model_id`

### `main.py` (CLI)

- Add `--model` / `-m` flag to all commands
- If omitted and only one model exists, use it. If multiple, error with available slugs list

## Frontend

### Routing

```
/                              → LandingPage (card grid)
/models/:slug                  → Redirect to /models/:slug/rankings
/models/:slug/rankings         → Rankings
/models/:slug/stats            → Stats
/models/:slug/catalog          → Accessory catalog
/models/:slug/crawl            → Crawl management
/models/:slug/ads/:id          → Ad detail
```

### New Components

- **`LandingPage`** — Fetches `GET /api/bike-models`, renders card grid (bike image, brand, name, ad count, price range). Click navigates to `/models/:slug/rankings`
- **`ModelLayout`** — Wrapper for model-scoped pages. Reads `:slug` from URL, fetches model data, provides model context via React context. Shows model name in header/breadcrumb. Contains existing Sidebar

### Modified Components

- **`App.tsx`** — New route structure: `LandingPage` at `/`, `ModelLayout` wrapping `/models/:slug/*` routes
- **`Sidebar.tsx`** — Add "back to all models" link. Nav URLs include slug
- **`FilterBar.tsx`** — Fetch variants from `GET /api/bike-models/:slug/variants` instead of hardcoded `VARIANT_OPTIONS`
- **`StatsPage.tsx`** — Variant chart colors assigned from a palette by index, not hardcoded to Himalayan variant names
- **`AdDetail` / `AdForm`** — Variant/color/wheel dropdowns populated from model's variant catalog
- **All API calls** — Prefixed with `/api/bike-models/:slug/`

### Removed

- **`frontend/src/lib/constants.ts`** — `VARIANTS`, `COLORS`, `WHEEL_TYPES` deleted. Everything from API

### State Management

- Current model slug lives in the URL (`:slug` route param)
- `useCurrentModel()` hook reads slug from URL, provides model data cached by TanStack Query

### i18n

New translation keys for landing page, model selection, breadcrumbs. Existing keys unchanged.

## Migration Strategy

Single Alembic migration file, executed in order:

1. Create all new tables (`bike_model`, `bike_model_config`, `bike_variant`, `bike_consumable`, `bike_accessory_pattern`, `bike_variant_pattern`, `bike_exclusion_pattern`, `bike_search_config`)
2. Add nullable `bike_model_id` column to `ad`, `crawl_session`, `accessory_override`
3. Insert "Himalayan 450" bike model (id=1, slug=`himalayan-450`, brand="Royal Enfield", engine_cc=452, active=true)
4. Insert `bike_model_config` row: warranty_years=3, warranty_value_per_year=200, mechanical_wear_per_km=0.03, condition_risk_per_km=0.04, short_term_km_threshold=3000
5. Insert 7 `bike_variant` rows from current `NEW_PRICES` dict
6. Insert 4 `bike_consumable` rows from current `CONSUMABLES` list
7. Insert 328 `bike_accessory_pattern` rows from current `ACCESSORY_PATTERNS`
8. Insert 6 `bike_variant_pattern` rows from current `VARIANT_PATTERNS`
9. Insert exclusion patterns from current `EXCLUSION_PATTERNS`
10. Insert 1 `bike_search_config` row: keyword="Himalayan", min_cc=420, max_cc=99999
11. `UPDATE ad SET bike_model_id = 1`
12. `UPDATE crawl_session SET bike_model_id = 1`
13. Make `bike_model_id` non-nullable on `ad` and `crawl_session`, add FK constraints
14. Add indexes on `(bike_model_id, variant)` and `(bike_model_id, price)` on `ad`

Himalayan 450 seed data lives in migration code (one-time schema migration). Future models added via admin API.

Migration is reversible: drop new tables, drop `bike_model_id` columns.

## What Stays Unchanged

- **LBC service** (`lbc_service.py`, `lbc_client.py`) — already generic
- **Dev proxy** (`devproxy.py`) — infrastructure
- **Config** (`config.py`) — no bike-specific config
- **Deployment** — Vercel + Railway, same architecture
- **Repost/duplicate detection** — same algorithm, scoped to `bike_model_id`
- **Ad merging** — same logic within a model
- **Price history** — same system
- **Sold tracking** — same system
- **i18n architecture** — FR/EN via react-i18next, just new keys added
