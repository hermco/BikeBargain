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
| `active` | Boolean | Whether model appears on landing page. Used for soft-delete — deactivating a model hides it from the landing page but preserves all ads and data |
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
| `wheel_type` | String, default `"default"` | e.g., "standard", "tubeless". Use `"default"` for bikes without wheel options (avoids NULL in unique constraint) |
| `new_price` | Integer | EUR |
| `color_hex` | String, nullable | Optional CSS color for charts/badges, e.g., "#3b82f6". If NULL, frontend assigns from a default palette by variant index |

Unique constraint on `(bike_model_id, variant_name, color, wheel_type)`. Uses `"default"` sentinel instead of NULL for `wheel_type` to ensure the unique constraint works correctly (`NULL != NULL` in SQL would allow silent duplicates).

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
| `matched_color` | String, nullable | Color to assign on match (e.g., "Kaza Brown"). Nullable — some patterns detect variant without implying a color |
| `matched_wheel_type` | String, nullable | Wheel type to assign on match. Nullable — most patterns don't imply wheel type |
| `priority` | Integer | Higher priority checked first |

The current `VARIANT_PATTERNS` in `extractor.py` maps patterns to `(variant, color, wheel_type)` tuples. This table preserves that full mapping. `matched_color` and `matched_wheel_type` are nullable because some patterns detect only the variant (e.g., "summit" → Summit variant, but color must be inferred from other signals).

The current `color_map` fallback in `_detect_variant()` (mapping French color words like "blanc" → Summit/Kamet White) is also migrated to this table as low-priority variant patterns. This eliminates the hardcoded Himalayan-specific fallback block entirely.

#### `bike_new_listing_pattern`

Patterns for detecting new/unsold listings from ad text (e.g., engine specs, dealer language).

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `bike_model_id` | FK → bike_model | |
| `regex_pattern` | String | Python regex |
| `category` | String | `"model_spec"` (e.g., "moteur sherpa 450"), `"dealer"` (e.g., strong dealer patterns), `"generic"` (generic new listing indicators) |
| `weight` | Float, default 1.0 | Scoring weight for pattern matches |

Currently `NEW_LISTING_PATTERNS` (12 patterns) and `STRONG_DEALER_PATTERNS` (5 patterns) in `extractor.py` are hardcoded to Himalayan specs ("moteur sherpa 450", "monocylindre 452", "40cv...8000tr"). These must be per-model. Generic patterns (e.g., "0 km", "jamais roulé") can be shared — see the model import/cloning section below.

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
| `min_cc` | Integer, nullable | Minimum engine CC filter. NULL = no filter |
| `max_cc` | Integer, nullable | Maximum engine CC filter. NULL = no filter |

`min_cc` and `max_cc` are nullable because some bikes don't need CC filtering (e.g., electric bikes, or when the keyword is specific enough).

### Modified Tables

#### `ad`

- Add `bike_model_id` (FK → `bike_model`, non-nullable after migration)
- Add index on `(bike_model_id, variant)`
- Add index on `(bike_model_id, price)`

#### `crawl_session`

- Add `bike_model_id` (FK → `bike_model`, non-nullable after migration)
- Add index on `(bike_model_id, status)` — used by the crawl session management query that closes active sessions

#### `accessory_override`

- Change PK from `group_key` alone to composite `(bike_model_id, group_key)` — without this, an override for "crash_bars" on one model would conflict with another model's "crash_bars" override
- Add `bike_model_id` (FK → `bike_model`)
- Implement via `__table_args__ = (PrimaryKeyConstraint('bike_model_id', 'group_key'),)` in SQLModel since `Field(primary_key=True)` on multiple fields doesn't produce a composite PK reliably
- Update `get_accessory_overrides()` to filter by `bike_model_id`
- Update `set_accessory_override()` — `session.get(AccessoryOverride, group_key)` must become `session.get(AccessoryOverride, (bike_model_id, group_key))` (tuple for composite PK)

## API

### New Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/bike-models` | GET | List active bike models with summary stats (ad count, price range) for landing page |
| `GET /api/bike-models/{slug}` | GET | Single model detail including config |
| `GET /api/bike-models/{slug}/variants` | GET | Variant/color/wheel catalog for dropdowns |
| `GET /api/bike-models/{slug}/accessories` | GET | Accessory pattern catalog |
| `POST /api/bike-models` | POST | Create new bike model (admin) |
| `POST /api/bike-models/import` | POST | Bulk import a complete model definition (model + config + variants + accessories + consumables + search configs + patterns) from a single JSON payload. Used for onboarding new models without making dozens of API calls |
| `POST /api/bike-models/{slug}/clone` | POST | Clone all patterns (accessories, variants, variant patterns, exclusion patterns, new listing patterns, search configs, consumables, config) from another model. Accepts `{"source_slug": "himalayan-450"}`. Useful for setting up similar bikes quickly — clone then edit |
| `PATCH /api/bike-models/{slug}` | PATCH | Update model metadata (admin) |
| `PUT /api/bike-models/{slug}/config` | PUT | Set analyzer config (admin) |
| `POST /api/bike-models/{slug}/variants` | POST | Add variant (admin) |
| `DELETE /api/bike-models/{slug}/variants/{id}` | DELETE | Remove variant (admin) |
| `POST /api/bike-models/{slug}/accessories` | POST | Add accessory pattern (admin) |
| `PATCH /api/bike-models/{slug}/accessories/{id}` | PATCH | Update accessory pattern (admin) |
| `DELETE /api/bike-models/{slug}/accessories/{id}` | DELETE | Remove accessory pattern (admin) |
| `POST /api/bike-models/{slug}/search-configs` | POST | Add search keyword (admin) |
| `POST /api/bike-models/{slug}/variant-patterns` | POST | Add variant detection pattern (admin) |
| `GET /api/ads/{id}/model-slug` | GET | Lightweight lookup returning just the model slug for an ad ID. Used by frontend legacy URL redirects (`/ads/:id` → `/models/{slug}/ads/:id`) |

Admin endpoints have no authentication for now (same as the rest of the app). Auth is a future concern. No admin UI in this spec — models are managed via CLI or direct API calls. Admin UI is a future phase.

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
| `GET /api/accessory-catalog` | `GET /api/bike-models/{slug}/catalog` |
| `PATCH /api/accessory-catalog/{group}` | `PATCH /api/bike-models/{slug}/catalog/{group}` |
| `DELETE /api/accessory-catalog/{group}/override` | `DELETE /api/bike-models/{slug}/catalog/{group}/override` |
| `POST /api/crawl/...` | `POST /api/bike-models/{slug}/crawl/...` |
| `GET /api/export` | `GET /api/bike-models/{slug}/export` |
| `POST /api/ads/check-prices` | `POST /api/bike-models/{slug}/ads/check-prices` |

The slug is resolved to `bike_model_id` via a shared FastAPI dependency (`get_bike_model_by_slug()`). The resolved `bike_model_id` is injected into `ad_data` dicts passed to `upsert_ad()` — the `AdPayload` schema does NOT include `bike_model_id` as a field; it is set from the URL path parameter.

### Backward-Compatible Routes

To avoid breaking existing bookmarks, API clients, or open browser tabs during deployment, the old routes are kept as aliases that resolve to the default model (Himalayan 450):

- `GET /api/ads` → internally calls `GET /api/bike-models/himalayan-450/ads` (same for all old routes)
- These aliases only work when there is exactly one bike model. Once a second model is added, they return `400 Bad Request` with a message listing available model slugs
- These aliases are temporary — they will be removed in a future version

This also handles the Vercel + Railway independent deployment window: the backend can be deployed first with both old and new routes, then the frontend deployed after.

### Landing Page Stats Performance

`GET /api/bike-models` returns summary stats (ad count, price range) for each model. These are computed via a single aggregation query with `GROUP BY bike_model_id` joining `ad`. At the expected scale (< 50 models, < 10K total ads), this is fast enough without denormalization. If scale increases, add cached columns on `bike_model` (`ad_count`, `price_min`, `price_max`) updated via a periodic task.

### Export

`GET /api/bike-models/{slug}/export` exports CSV scoped to the model. The CSV includes a `bike_model` column for clarity.

### Model Deletion

No `DELETE /api/bike-models/{slug}` endpoint. Deactivation via `PATCH /api/bike-models/{slug}` setting `active: false` is the only option. This preserves all ads and data. Hard deletion is not supported to prevent accidental data loss.

## Backend Refactor

### `src/lbc_service.py` — Architecture Change

The spec previously claimed `lbc_service.py` and `lbc_client.py` were "already generic". This is **incorrect**. The LBC service must change:

**Problem:** In split production mode, the LBC service runs on a residential IP machine without DB access. Currently `lbc_service.py` calls `search_all_ads()` (which uses hardcoded `SEARCH_TEXT = "Himalayan"`, `SEARCH_CC_MIN = 420`) and `fetch_ad()` (which calls `detect_accessories()`, `_detect_variant()` — all needing DB patterns).

**Solution: LBC service becomes raw scraping only.** All business logic (variant detection, accessory detection, new listing detection) moves to the API layer which has DB access. The LBC service only does:
- `/search` — accepts `keyword`, `min_cc`, `max_cc` as parameters, returns raw LBC ad data
- `/fetch-ad` — accepts URL, returns raw ad data from LBC (no variant/accessory detection)
- `/check-ad` and `/check-ads` — unchanged (just check if URLs are still live)

This is a breaking change to the LBC service API contract. Both `lbc_service.py` and `lbc_client.py` must be updated together.

### `src/lbc_client.py` — Updated Contract

- `lbc_client.search(keyword, min_cc, max_cc)` — now accepts and transmits search parameters
- `lbc_client.fetch_ad(url)` — returns raw ad data only. The caller (API layer) handles variant detection, accessory detection, and new listing detection using DB-loaded patterns

### `src/extractor.py`

- Remove `NEW_PRICES`, `VARIANT_PATTERNS`, `NEW_LISTING_PATTERNS`, `STRONG_DEALER_PATTERNS` constants
- Remove the `color_map` fallback block in `_detect_variant()` — migrate those mappings (e.g., "blanc" → Summit/Kamet White) into `bike_variant_pattern` as low-priority entries
- `fetch_ad(url, bike_model_id, session)` — takes `bike_model_id` to load the right patterns. In split mode, calls `lbc_client.fetch_ad(url)` for raw data, then applies detection locally
- `_detect_variant(subject, body, attributes, bike_model_id, session)` — loads `BikeVariantPattern` rows from DB, matches in priority order. Returns `(variant, color, wheel_type)` tuple, using `matched_color` and `matched_wheel_type` from the pattern when available. No more hardcoded `color_map` fallback
- `_estimate_new_price(bike_model_id, variant, color, wheel_type, session)` — looks up `BikeVariant` table. Called from `api.py` in 4 places (confirm_ad, update_ad, merge_ad) and `main.py` — all call sites must pass `bike_model_id` and an active session
- `detect_new_listing(ad_data, bike_model_id, session)` — loads `BikeNewListingPattern` rows from DB, scores matches using weights. Compares price against model's `BikeVariant` catalog prices. Signature changes from individual kwargs (`seller_type`, `price`, `mileage_km`, `subject`, `body`, `variant`, `color`, `wheel_type`) to `(ad_data: dict, bike_model_id, session)`. All call sites in `api.py` must be updated
- `detect_new_listing_light(subject, price, seller_type, catalog_prices)` — signature changed to accept `catalog_prices: list[int]` as parameter. The caller loads catalog prices once before the crawl loop and passes them in. No DB access inside the function

### `src/accessories.py`

- Remove `ACCESSORY_PATTERNS` constant (328 patterns) and `EXCLUSION_PATTERNS`
- `detect_accessories(text, bike_model_id, session, *, patterns=None, exclusions=None)` — accepts optional pre-loaded patterns. If not provided, loads from DB. This avoids N+1 queries during bulk operations like `refresh_accessories()`
- `compute_used_value()` — reads `depreciation_rate` from each pattern's DB row instead of global 0.65
- Exclusion patterns loaded from `BikeExclusionPattern` table
- Regex matching engine and dedup group logic stay unchanged

### Pattern Caching Strategy

Loading 328+ regex patterns from DB on every request is a performance concern, especially during bulk operations (crawl, refresh_accessories). Strategy:

1. **Bulk operations (crawl, refresh):** Load patterns once at the start of the operation, pass as parameter to all function calls in the loop. No per-call DB queries.
2. **Single-ad operations (preview, confirm):** Load from DB per request. At < 5ms per query, this is acceptable for single operations.
3. **No application-level cache (LRU, etc.)** — patterns are mutable (admin can edit them). Stale cache would cause confusing behavior. The bulk-load-and-pass approach is simpler and sufficient.

### `src/analyzer.py`

- Remove `WARRANTY_DURATION_YEARS`, `WARRANTY_VALUE_PER_YEAR`, `CONSUMABLES`, `MECHANICAL_WEAR_PER_KM`, `CONDITION_RISK_PER_KM`, `SHORT_TERM_KM_THRESHOLD` constants
- `compute_consumable_wear(mileage, consumables)` — accepts pre-loaded `BikeConsumable` list as parameter
- `compute_warranty(year, config)` — accepts pre-loaded `BikeModelConfig` as parameter
- `rank_ads(bike_model_id, session)` — loads model config and consumables once, passes to computation functions. Filters ads by model

### `src/crawler.py`

- Remove `SEARCH_TEXT`, `SEARCH_CC_MIN`, `SEARCH_CC_MAX` constants
- `search_all_ads(bike_model_id, session)` — loads `BikeSearchConfig` rows (multiple keywords per model), runs a search for each keyword, deduplicates results by LBC ad ID. When `min_cc`/`max_cc` are NULL, omits the CC filter from the LBC search
- In split mode, passes search parameters to `lbc_client.search(keyword, min_cc, max_cc)` instead of calling LBC directly

### Crawl Session Scoping

The current crawl start code closes ALL active sessions before creating a new one. This must be scoped to the model:

```python
# Before (broken for multi-model):
active_sessions = session.exec(
    select(CrawlSession).where(CrawlSession.status == "active")
).all()

# After (scoped):
active_sessions = session.exec(
    select(CrawlSession).where(
        CrawlSession.status == "active",
        CrawlSession.bike_model_id == bike_model_id
    )
).all()
```

This allows concurrent crawl sessions for different models.

### `src/api.py` — Specific Internal Changes

Beyond endpoint restructuring, these internal functions need model-scoping:

- **`_find_potential_duplicates()`** — must filter by `bike_model_id` in its SQL query. Currently compares all ads in DB regardless of model
- **`check_ads_online()`** — currently loads `select(Ad).where(Ad.sold == 0)` for all ads. Must scope to `bike_model_id`
- **`check_prices()`** — same scoping needed. Also calls `search_all_ads()` or `lbc_client.search()` which must now receive model-specific search parameters
- **`_extract_significant_words()`** — stopwords list currently includes `"royal", "enfield", "himalayan"` (Himalayan-specific). Must dynamically add the current model's brand and name words to the stopwords list
- **`GET /api/accessory-catalog`** endpoint — currently iterates directly on imported `ACCESSORY_PATTERNS` constant. Must load from `BikeAccessoryPattern` table filtered by model. The `PATCH` and `DELETE /override` sub-endpoints for accessory overrides must also scope by model
- **`AdPayload` schema** — does NOT add a `bike_model_id` field. The `bike_model_id` is resolved from the URL slug via `get_bike_model_by_slug()` dependency and injected into the `ad_data` dict before passing to `upsert_ad()`. This keeps the payload clean and prevents slug/ID mismatches

### `src/database.py`

- Add `bike_model_id` to `_AD_FIELDS`
- Add CRUD functions for new tables: `get_bike_model()`, `get_bike_models()`, `get_bike_model_by_slug()`, etc.
- `upsert_ad()` takes `bike_model_id` — callers (`api.py`, `main.py`) must include it in the `ad_data` dict
- `refresh_accessories(bike_model_id, session)` — scoped to model. Loads patterns once, passes to `detect_accessories()` calls in the loop
- `get_accessory_overrides(bike_model_id, session)` — filter by model
- `set_accessory_override(bike_model_id, group_key, ...)` — uses composite PK lookup: `session.get(AccessoryOverride, (bike_model_id, group_key))`

### `src/models.py`

- New SQLModel classes for all new tables with proper relationships
- FK on `Ad.bike_model_id`, `CrawlSession.bike_model_id`
- `AccessoryOverride` PK changed to composite `(bike_model_id, group_key)` using `__table_args__ = (PrimaryKeyConstraint('bike_model_id', 'group_key'),)`
- Ensure `alembic/env.py` imports all new models for autogenerate to detect them

### `main.py` (CLI)

- Add `--model` / `-m` flag to all commands, accepting the model slug (not numeric ID)
- If omitted and only one active model exists, use it automatically
- If omitted and multiple active models exist, error with message listing available slugs
- Add `python main.py import-model <file.json>` command for importing a complete model definition from JSON
- All `_estimate_new_price()` calls must pass `bike_model_id` and session

## Frontend

### Routing

```
/                              → LandingPage (card grid) — auto-redirects to model if only 1 active model
/models                        → Redirect to /
/models/:slug                  → Redirect to /models/:slug/rankings
/models/:slug/rankings         → Rankings
/models/:slug/stats            → Stats
/models/:slug/catalog          → Accessory catalog
/models/:slug/crawl            → Crawl management
/models/:slug/ads/:id          → Ad detail
```

### Legacy URL Redirects

Old URLs are redirected to preserve bookmarks and shared links:

```
/rankings                      → /models/{default-slug}/rankings
/stats                         → /models/{default-slug}/stats
/catalog                       → /models/{default-slug}/catalog
/ads/:id                       → /models/{slug-from-ad}/ads/:id
```

For `/ads/:id`, the frontend fetches the ad from a lookup endpoint (`GET /api/ads/:id/model-slug`) that returns the model slug, then redirects. This is a lightweight endpoint that just joins `ad` → `bike_model` for the slug.

### Single-Model Auto-Redirect

When `GET /api/bike-models` returns exactly 1 active model, the `LandingPage` component auto-redirects to `/models/{slug}/rankings` without rendering the card grid. This avoids a useless extra click for users who only track one bike. The landing page grid only renders when 2+ models exist.

### New Components

- **`LandingPage`** — Fetches `GET /api/bike-models`, auto-redirects if 1 model, renders card grid if 2+ (bike image, brand, name, ad count, price range). Click navigates to `/models/:slug/rankings`. No bottom nav on this page (no model context)
- **`ModelLayout`** — Wrapper for model-scoped pages. Reads `:slug` from URL, fetches model data, provides model context via React context (including variant catalog for dropdowns). Pre-loads variant catalog so child components have immediate access without loading states in inline pickers. Contains existing Sidebar scoped to current model

### Modified Components

- **`App.tsx`** — New route structure: `LandingPage` at `/`, `ModelLayout` wrapping `/models/:slug/*` routes. Legacy redirect routes for `/rankings`, `/stats`, `/catalog`, `/ads/:id`
- **`Layout.tsx`** — Split into `Layout` (landing page, minimal) and `ModelLayout` (model-scoped pages, full sidebar)
- **`Sidebar.tsx`** — Active model block at the top (below logo): model thumbnail + name + brand, clickable `<Link to="/">` to navigate back. `ChevronLeft` icon to signal navigation up. `SidebarStats` only renders when inside a model context (hidden on landing page — conditioned on slug being present). `NAV_KEYS` becomes dynamic — URLs include the current slug via `useModelUrl()` hook. "Ajouter une annonce" button navigates to `modelUrl('/?add=true')` instead of hardcoded `/?add=true`
- **`FilterBar.tsx`** — Fetch variants from `GET /api/bike-models/:slug/variants` instead of hardcoded `VARIANT_OPTIONS`. Wheel types also from API. Show "Aucune variante configurée" / "No variants configured" if the catalog is empty
- **`StatsPage.tsx`** — Variant chart colors use `color_hex` from variant catalog when available, fall back to a palette-by-index assignment. Remove hardcoded `variantChartColor()` mapping
- **`AdDetailPage.tsx`** — Variant/color/wheel dropdowns populated from model's variant catalog. Links to `superseded_by` / `previous_ad_id` use `useModelUrl()` (same model guaranteed)
- **`AdForm.tsx`** — Variant/color/wheel dropdowns from model catalog (loaded via `ModelLayout` context, no loading state). Remove import of `VARIANTS`, `COLORS`, `WHEEL_TYPES` from `constants.ts`
- **`AdCard.tsx`** — `<Link to>` uses `useModelUrl()`. Replace `variantColor()` import with catalog-based color lookup
- **`RankingPage.tsx`** — Links use `useModelUrl()`. Replace `variantColor()` / `variantChartColor()` with catalog-based lookup
- **`CrawlPage.tsx`** — Links use `useModelUrl()`. Replace `variantColor()` import. All API calls prefixed with model slug. This is the highest-risk component (~1000 lines, complex state machine) — every API call (search, extract, confirm, merge, check-prices) must be scoped
- **`CatalogPage.tsx`** — Now per-model, loads from `GET /api/bike-models/{slug}/catalog`
- **All `<Link to>` and `navigate()` calls** — Comprehensive audit and migration to `useModelUrl()` across all components

### `useModelUrl()` Hook

Centralizes URL generation for model-scoped routes:

```tsx
const { modelUrl } = useCurrentModel()
// modelUrl('/ads/42') → '/models/himalayan-450/ads/42'
// modelUrl('/rankings') → '/models/himalayan-450/rankings'
```

All internal `<Link to>` and `navigate()` calls use this hook. `NAV_KEYS` in `Sidebar.tsx` becomes dynamically generated using `modelUrl()`.

### TanStack Query Key Namespacing

All query keys must be namespaced by model slug to prevent cross-model cache pollution:

```tsx
// Before:
['ads'], ['stats'], ['rankings'], ['catalog']

// After:
['ads', slug], ['stats', slug], ['rankings', slug], ['catalog', slug]
```

This applies to **all** query keys in `hooks/queries.ts` (~30+ occurrences). `invalidateQueries` calls in mutations must also be scoped by slug. Forgetting even one key causes stale data from model A to appear in model B's context.

### Removed

- **`frontend/src/lib/constants.ts`** — `VARIANTS`, `COLORS`, `WHEEL_TYPES` deleted. Everything from API. All imports of these constants in `AdForm.tsx`, `AdDetailPage.tsx`, `CrawlPage.tsx` must be removed
- **`variantColor()` / `variantChartColor()`** in `frontend/src/lib/utils.ts` — replaced by `color_hex` from API + palette fallback. Used in `AdCard`, `AdForm`, `AdDetailPage`, `RankingPage`, `CrawlPage`, `StatsPage`. Create a `useVariantColor(variantName)` hook that reads from model context

### State Management

- Current model slug lives in the URL (`:slug` route param)
- `useCurrentModel()` hook reads slug from URL, provides model data (name, brand, slug, config, variant catalog) cached by TanStack Query
- `useModelUrl()` hook generates scoped URLs using the current slug
- `useVariantColor(variantName)` hook returns CSS color from variant catalog's `color_hex` or palette fallback

### Empty States

Define explicit empty states for edge cases:

- **Landing page with 0 models:** Message "Aucun modèle configuré" / "No model configured" with instructions to add one via API
- **Model with 0 ads (landing card):** Card displays "Aucune annonce" / "No listings" with no price range. Card is still clickable
- **Model with 0 ads (inside model):** Existing empty state pattern applies. Crawl page shows a CTA to start a search
- **Model with no search config:** Crawl page shows "Recherche non configurée" / "Search not configured" instead of the start button
- **Model with no variants configured:** FilterBar dropdowns show "Aucune variante" / "No variants". AdForm dropdowns show the same. Variant/color/wheel are left blank (user enters manually or skips)

### Mobile Navigation

On mobile (bottom nav with 5 items), no 6th item is added. Instead:

- **Inside model context:** A sticky compact header above the content area shows the model name + brand with a `ChevronLeft` back button to `/`. This is always visible and serves as both context indicator and back navigation
- **On landing page:** Bottom nav is not shown (no model context, no model-scoped nav items apply)

### Accessibility

- Landing page cards are `<Link>` elements (not `<div>` with `onClick`) for keyboard navigation and screen readers
- Each card has `aria-label` with full description: "Royal Enfield Himalayan 450 — 47 annonces, 4 200 € – 6 500 €"
- "Back to all models" is a `<Link to="/">` (not a button with `navigate()`) for right-click → open in new tab
- Active model indicator in sidebar uses `aria-current="true"`
- Variant color filter buttons (toggle chips in RankingPage) get `role="checkbox"` and `aria-pressed` attributes

### Page Titles

Dynamic `<title>` per page including model name:

- Landing page: "BikeBargain"
- Rankings: "Classement — Himalayan 450 — BikeBargain"
- Stats: "Statistiques — Himalayan 450 — BikeBargain"
- Ad detail: "Ad title — Himalayan 450 — BikeBargain"

Implemented via a `useDocumentTitle()` hook using `document.title` in a `useEffect` — no external dependency needed.

### i18n

New translation keys:

| Key | FR | EN |
|-----|----|----|
| `landing.title` | Choisissez un modèle | Choose a model |
| `landing.empty` | Aucun modèle configuré | No model configured |
| `landing.noAds` | Aucune annonce | No listings |
| `nav.allModels` | Tous les modèles | All models |
| `model.noSearchConfig` | Recherche non configurée | Search not configured |
| `model.noVariants` | Aucune variante configurée | No variants configured |

Existing keys unchanged. Category names (`catalog.categories.*`) already exist and are reusable. Unknown categories fall back to displaying the raw category string.

## Migration Strategy

Two Alembic migration files to allow partial rollback. **Migration 2 must run inside a single transaction** (Alembic default via `context.begin_transaction()`) to ensure atomicity — if any INSERT/UPDATE fails, everything rolls back cleanly.

### Pre-Migration: Generate Seed Data

Before writing migrations, run a one-time script that reads the current Python constants and generates JSON seed files:

```bash
python scripts/generate_seed_data.py
```

This reads `ACCESSORY_PATTERNS`, `VARIANT_PATTERNS`, `NEW_LISTING_PATTERNS`, `STRONG_DEALER_PATTERNS`, `EXCLUSION_PATTERNS`, `NEW_PRICES`, `CONSUMABLES` and the `color_map` fallback from the current code and outputs:
- `alembic/seed_himalayan_accessories.json` (328 patterns)
- `alembic/seed_himalayan_variants.json` (7 variants with color_hex)
- `alembic/seed_himalayan_variant_patterns.json` (6 patterns + color_map entries as low-priority patterns)
- `alembic/seed_himalayan_new_listing_patterns.json` (12 + 5 patterns)
- `alembic/seed_himalayan_exclusions.json`
- `alembic/seed_himalayan_consumables.json` (4 items)
- `alembic/seed_himalayan_search_config.json`
- `alembic/seed_himalayan_config.json`

This avoids manual transcription errors for 350+ data points.

### Migration 1: Schema (DDL)

1. Create all new tables (`bike_model`, `bike_model_config`, `bike_variant`, `bike_consumable`, `bike_accessory_pattern`, `bike_variant_pattern`, `bike_new_listing_pattern`, `bike_exclusion_pattern`, `bike_search_config`)
2. Add nullable `bike_model_id` column to `ad`, `crawl_session`
3. Add `bike_model_id` column and change PK to composite `(bike_model_id, group_key)` on `accessory_override` — requires: drop existing PK constraint, add nullable column, will be made non-nullable in migration 2
4. Add `color_hex` column to `bike_variant`

Explicit `downgrade()`: drop all new tables, drop added columns, restore original PK on `accessory_override`.

### Migration 2: Data (DML) + Constraints

1. Insert "Himalayan 450" bike model (id=1, slug=`himalayan-450`, brand="Royal Enfield", engine_cc=452, active=true)
2. Insert `bike_model_config` row: warranty_years=3, warranty_value_per_year=200, mechanical_wear_per_km=0.03, condition_risk_per_km=0.04, short_term_km_threshold=3000
3. Insert 7 `bike_variant` rows from `seed_himalayan_variants.json` (with `color_hex` values matching current `variantColor()` mapping)
4. Insert 4 `bike_consumable` rows from `seed_himalayan_consumables.json`
5. Insert 328 `bike_accessory_pattern` rows from `seed_himalayan_accessories.json`
6. Insert variant pattern rows from `seed_himalayan_variant_patterns.json` (original 6 + color_map fallback entries as low-priority)
7. Insert `bike_new_listing_pattern` rows from `seed_himalayan_new_listing_patterns.json`
8. Insert exclusion patterns from `seed_himalayan_exclusions.json`
9. Insert search config from `seed_himalayan_search_config.json`
10. `UPDATE ad SET bike_model_id = 1`
11. `UPDATE crawl_session SET bike_model_id = 1`
12. `UPDATE accessory_override SET bike_model_id = 1`
13. Make `bike_model_id` non-nullable on `ad`, `crawl_session`, and `accessory_override`. Add FK constraints. Recreate composite PK on `accessory_override`
14. Add indexes on `(bike_model_id, variant)` and `(bike_model_id, price)` on `ad`
15. Add index on `(bike_model_id, status)` on `crawl_session`

Explicit `downgrade()`: delete inserted seed data, set `bike_model_id` columns back to nullable, drop constraints and indexes.

### Deployment Sequence

To avoid downtime with Vercel + Railway deployed independently:

1. **Deploy backend** (Railway) — includes both old routes (aliases) and new `/api/bike-models/{slug}/...` routes. Old frontend continues working via aliases
2. **Run migration** — schema + data migration. Existing ads get `bike_model_id = 1`
3. **Deploy frontend** (Vercel) — new routing, uses new API routes
4. Old route aliases remain active as fallback. Remove in a future release

### Seed Data Format

The 328 accessory patterns are stored in `alembic/seed_himalayan_accessories.json` (not as inline Python INSERT statements). Format:

```json
[
  {
    "regex_pattern": "crash\\s*bars?\\s+sw[\\s-]*motech",
    "name": "Crash bars SW-Motech",
    "category": "protection",
    "new_price": 250,
    "depreciation_rate": 0.65,
    "dedup_group": "crash_bars",
    "sort_order": 1
  }
]
```

This file is generated once from the current `ACCESSORY_PATTERNS` constant via `scripts/generate_seed_data.py`.

## Implementation Order

The implementation must follow this dependency order:

1. **`scripts/generate_seed_data.py`** — generate all seed JSON files from current constants
2. **`src/models.py`** — new SQLModel classes for all new tables
3. **Migration 1 (DDL)** + **Migration 2 (DML)** — schema + seed data
4. **`src/database.py`** — CRUD for new tables, scoping by `bike_model_id`
5. **`src/lbc_service.py` + `src/lbc_client.py`** — raw scraping only, parameterized search
6. **`src/extractor.py` + `src/accessories.py` + `src/analyzer.py` + `src/crawler.py`** — refactor signatures, load from DB
7. **`src/api.py`** — new endpoints + scoped existing endpoints + backward compat aliases
8. **`main.py`** — `--model` flag
9. **`frontend/src/types.ts`** — new TypeScript interfaces (`BikeModel`, `BikeVariant`, `BikeModelConfig`)
10. **`frontend/src/hooks/`** — `useCurrentModel()`, `useModelUrl()`, `useVariantColor()`, query key namespacing
11. **`frontend/src/App.tsx`** — routing + `Layout`/`ModelLayout` split
12. **`frontend/src/components/Sidebar.tsx`** — model block, dynamic nav, conditional stats
13. **All pages and components** — scoped API calls, link migration, remove constants imports
14. **`frontend/src/pages/LandingPage.tsx`** — new component
15. **i18n keys** — `en.json` / `fr.json`

Step 5 (LBC service) should be resolved first among the business logic changes, as the architectural decision (raw scraping only) conditions the signatures in steps 6-7.

## What Stays Unchanged

- **Dev proxy** (`devproxy.py`) — infrastructure
- **Config** (`config.py`) — no bike-specific config
- **Deployment architecture** — Vercel + Railway, same stack
- **Repost/duplicate detection algorithm** — same logic, scoped to `bike_model_id`
- **Ad merging** — same logic within a model
- **Price history** — same system
- **Sold tracking** — same system
- **i18n architecture** — FR/EN via react-i18next, just new keys added

## Risk Areas

| Area | Risk | Mitigation |
|------|------|------------|
| `CrawlPage.tsx` (~1000 lines) | Most complex component, many API calls to scope | Audit every API call and Link/navigate systematically |
| LBC service split mode | Architecture change, service contract breaks | Update `lbc_service.py` + `lbc_client.py` together, test split mode explicitly |
| TanStack query keys | Missing slug in one key = cross-model cache pollution | Grep for all query key definitions, ensure slug is present |
| `AccessoryOverride` PK change | SQLModel composite PK is tricky, `session.get()` signature changes | Use `__table_args__` with `PrimaryKeyConstraint`, test CRUD ops |
| Migration DML | 350+ inserts, must be atomic | Single transaction (Alembic default), test on DB dump first |
| `variantColor()` removal | Used in 7+ components, async replacement | Pre-load catalog in `ModelLayout` context, synchronous access in children |

## Future Considerations (Out of Scope)

These items are explicitly deferred and not part of this spec:

- **Admin UI** — managing bike models, variants, accessories via a web interface
- **User customization** — letting users configure their own models or override patterns
- **Shared/global accessory patterns** — inheritance or cross-model pattern sharing. For now, use the clone endpoint to copy patterns between models
- **Authentication** — no auth on any endpoint
- **Cross-model views** — global stats, cross-model comparisons, "all bikes" search
- **Model switcher** — quick switch between models without going through landing page
- **Last-visited model persistence** — saving last model to localStorage for auto-redirect
