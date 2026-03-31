# Multi-Model Onboarding — Design Spec

**Date:** 2026-03-31
**Goal:** Allow adding new bike models (starting with CFMOTO 450MT) entirely via the web UI, with per-model accessory catalogs.

## Context

The platform already supports multi-model at the data layer (all `bike_*` tables are scoped by `bike_model_id`), but two gaps remain:

1. The accessory catalog (`accessory_catalog_groups`, `accessory_catalog_variants`) is global — not scoped by model
2. There is no UI to create a new bike model — models must be inserted directly in the database

This spec addresses both gaps in three phases.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Catalog scoping | Per model (independent catalogs) | Avoids false positives between models with different accessory ecosystems |
| Migration strategy | Migrate existing catalog to Himalayan, then enforce NOT NULL FK | Single system, no dual mode |
| Model creation | Web UI (form) | Long-term vision: everything via the interface |
| Initial model data | Minimal (model + search config) | Catalog and variants built iteratively after first crawl |
| Accessory overrides table | Remove | Redundant when each model has its own catalog with its own prices |

## Phase 1 — Scope Accessory Catalog by Model

### Database Migration (Alembic)

**Table `accessory_catalog_groups`:**

1. Lookup Himalayan ID dynamically: `SELECT id FROM bike_models WHERE slug = 'himalayan-450'` (do NOT hardcode `id=1`)
2. `UPDATE accessory_catalog_groups SET model_id = <himalayan_id>`
3. Rename column `model_id` → `bike_model_id`
4. Add foreign key constraint `bike_model_id → bike_models.id`
5. Set column to NOT NULL
6. Drop unique constraint on `group_key` alone
7. Add unique constraint on `(bike_model_id, group_key)`

**Table `accessory_overrides`:**

1. For each override row, update the corresponding `AccessoryCatalogGroup.default_price` where `group_key` matches (overrides apply at group level, not variant level)
2. Drop the `accessory_overrides` table

**Table `accessory_catalog_variants`:**

No schema changes — variants are linked to groups via `group_id`, which is already model-scoped through the group.

### Backend Changes

**Endpoints — move from `/api/catalog/*` to `/api/bike-models/{slug}/catalog/*`:**

| Before | After |
|--------|-------|
| `GET /api/catalog/groups` | `GET /api/bike-models/{slug}/catalog/groups` |
| `POST /api/catalog/groups` | `POST /api/bike-models/{slug}/catalog/groups` |
| `GET /api/catalog/groups/{id}` | `GET /api/bike-models/{slug}/catalog/groups/{id}` |
| `PATCH /api/catalog/groups/{id}` | `PATCH /api/bike-models/{slug}/catalog/groups/{id}` |
| `DELETE /api/catalog/groups/{id}` | `DELETE /api/bike-models/{slug}/catalog/groups/{id}` |
| `POST /api/catalog/groups/{id}/variants` | `POST /api/bike-models/{slug}/catalog/groups/{id}/variants` |
| `PATCH /api/catalog/variants/{id}` | `PATCH /api/bike-models/{slug}/catalog/variants/{id}` |
| `DELETE /api/catalog/variants/{id}` | `DELETE /api/bike-models/{slug}/catalog/variants/{id}` |
| `POST /api/catalog/suggest-synonyms` | `POST /api/bike-models/{slug}/catalog/suggest-synonyms` |
| `POST /api/catalog/preview-regex` | `POST /api/bike-models/{slug}/catalog/preview-regex` |
| `POST /api/catalog/preview-diff` | `POST /api/bike-models/{slug}/catalog/preview-diff` |
| `POST /api/catalog/test-on-ad` | `POST /api/bike-models/{slug}/catalog/test-on-ad` |
| `POST /api/catalog/reset` | `POST /api/bike-models/{slug}/catalog/reset` |
| `GET /api/catalog/export` | `GET /api/bike-models/{slug}/catalog/export` |
| `POST /api/catalog/import` | `POST /api/bike-models/{slug}/catalog/import` |
| `GET /api/catalog/refresh-status` | `GET /api/bike-models/{slug}/catalog/refresh-status` |

Note: `suggest-synonyms` and `preview-regex` are stateless (don't query the DB), but are scoped under the model path for route consistency. `preview-diff` and `test-on-ad` do need the model to load the correct catalog and must filter ads by `bike_model_id`.

**Endpoints to remove:**

| Endpoint | Reason |
|----------|--------|
| `GET /api/bike-models/{slug}/accessory-catalog` | Replaced by scoped catalog groups |
| `PATCH /api/bike-models/{slug}/accessory-catalog/{group}` | Overrides no longer needed |
| `DELETE /api/bike-models/{slug}/accessory-catalog/{group}/override` | Overrides no longer needed |
| Legacy compat wrappers (`/api/accessory-catalog`, etc. ~line 2279-2294 of `api.py`) | Stale after migration |

**`src/database.py` changes:**

- `get_catalog_groups(session)` → `get_catalog_groups(session, bike_model_id: int)`
  - Cache becomes `dict[int, list[dict]]` keyed by `bike_model_id`
  - `invalidate_catalog_cache(bike_model_id: int | None = None)` — invalidate one model or all
- `create_catalog_group(session, data)` — `data` must include `bike_model_id`
- `reset_catalog_to_seed(session)` → `reset_catalog_to_seed(session, bike_model_id: int)` — deletes only groups `WHERE bike_model_id = ?`, then re-inserts. Seed data (`seed_accessory_catalog.json`) only applies to Himalayan. For other models, reset is a no-op (or returns an error — no seed data available)
- `export_catalog(session)` → `export_catalog(session, bike_model_id: int)` — filters by model
- `import_catalog(session, data)` — must delete only groups `WHERE bike_model_id = ?` before re-inserting, and set `bike_model_id` on every imported group
- `refresh_accessories(session, bike_model_id)` — already receives `bike_model_id`, now passes it to `get_catalog_groups(session, bike_model_id)` to get only the correct model's patterns
- `_update_group_match_counts(session)` — must filter `AdAccessory` counts by `bike_model_id` via join with `Ad` to avoid inflated counts across models
- All catalog mutation endpoints that call `_background_refresh()` must pass `bike_model_id` so only the affected model's ads are refreshed

**`src/api.py` additional changes:**

- `_background_refresh(skip_manual, bike_model_id)` — new required parameter, forwarded to `refresh_accessories()`
- `redetect` endpoint — must pass `bike_model_id` to `get_catalog_groups()`
- `test-on-ad` endpoint — must filter ads by `bike_model_id` when querying

**`src/catalog.py` changes:**

No changes — `build_patterns_from_catalog()` is a pure function that takes a list of group dicts. The filtering by model happens upstream in `database.py`.

**`src/accessories.py` changes:**

No changes — `detect_accessories()` receives pre-filtered patterns.

### Frontend Changes

**`frontend/src/lib/api.ts`:**

All catalog API functions gain a `slug: string` parameter. URLs change from `/api/catalog/*` to `/api/bike-models/${slug}/catalog/*`.

**`frontend/src/hooks/queries.ts`:**

- All catalog query keys include `slug`: `['catalog', slug, 'groups']` instead of `['catalog', 'groups']`
- All catalog mutation hooks accept `slug` parameter
- Remove `useAccessoryCatalogScoped`, `useUpdateCatalogPriceScoped`, `useResetCatalogPriceScoped` (override hooks)

**`frontend/src/pages/CatalogPage.tsx`:**

- Already uses `useCurrentModel()` for context — wire `slug` into all catalog API calls
- Remove any override-related UI (price override badges, reset override buttons)
- "Reset to defaults" button: only show for Himalayan (seed data exists). For other models, hide the button or show "No default catalog available" message

**i18n:** All new/changed UI strings must use `t()` with keys in both `fr.json` and `en.json`. This applies across all phases.

## Phase 2 — Model Creation Page

### API

**`POST /api/bike-models`**

Request body:
```json
{
  "slug": "cfmoto-450mt",
  "brand": "CFMOTO",
  "name": "450MT",
  "engine_cc": 449,
  "image_url": "https://example.com/450mt.jpg",
  "search_config": {
    "keyword": "cfmoto 450mt",
    "min_cc": 449,
    "max_cc": 455,
    "price_min": 3000,
    "price_max": 8000,
    "owner_type": "private",
    "sort": "date"
  }
}
```

Response: `201 Created` with the created `BikeModel` object.

**Behavior:**
- Creates `BikeModel` row
- Creates `BikeModelConfig` with sensible defaults (copied from Himalayan values as starting point: `warranty_years=3`, `warranty_value_per_year=200`, `mechanical_wear_per_km=0.03`, `condition_risk_per_km=0.04`, `short_term_km_threshold=3000`)
- Creates one `BikeSearchConfig` from the provided `search_config`
- Auto-generates `slug` from `brand-name` (lowercased, hyphenated, accents stripped, non-alphanumeric removed) if not provided. Example: "Royal Enfield Himalayan 450" → "royal-enfield-himalayan-450"
- Validates slug uniqueness — returns 409 Conflict with explicit message if slug already taken
- Atomic: all three inserts (model + config + search config) in a single transaction

**`DELETE /api/bike-models/{slug}`**

- Only allowed if the model has zero ads (`ad_count = 0`). Returns 409 Conflict otherwise.
- Cascades: deletes `BikeModelConfig`, `BikeSearchConfig`, and any catalog groups for the model.
- Useful for correcting mistakes during model creation.

**Validation:**
- `slug`: optional, must match `^[a-z0-9-]+$`, unique
- `brand`: required, non-empty
- `name`: required, non-empty
- `engine_cc`: required, positive integer
- `image_url`: optional
- `search_config`: required (at least keyword needed to crawl)
- `search_config.min_cc` / `max_cc`: default to `engine_cc` / `engine_cc + 5` if omitted

### Frontend

**New route:** `/models/new` → `CreateModelPage`

This route must be declared as a **sibling outside** the `<Route path="/models/:slug" element={<ModelLayout />}>` block, not inside it. It must appear before the `:slug` route so React Router matches it first. The page renders standalone (no sidebar, no model context).

**Layout:**
- Back arrow / link to landing page (`/`) at top left — same visual treatment as the sidebar "All models" link
- Centered card layout, similar to existing dialog forms

**Form fields:**
- Marque (text input, required)
- Nom (text input, required)
- Slug (read-only preview, auto-generated from marque+nom, with a small "edit" icon to unlock manual editing)
- Cylindree (number input, required)
- Image URL (text input, optional — show preview thumbnail if URL is provided)
- Section "Configuration de recherche LeBonCoin":
  - Reuse the existing `ConfigForm` component from `SettingsPage` (includes `LocationsSelect` with department picker, `useLbcEnums()` for dropdowns, `search_in_title_only` toggle). Pre-fill `min_cc`/`max_cc` from `engine_cc`.

**Validation UX:**
- Slug conflict: inline field-level error ("Ce slug est deja utilise") rather than just a toast
- Required fields: standard HTML5 validation + visual indicators

**After submit:** redirect to `/models/{slug}/crawl`

**Landing page (`LandingPage.tsx`):**
- Add a "+" card at the end of the model grid, navigates to `/models/new`
- When zero models exist (empty state), replace the current "Aucun modele" message with a CTA card: "Ajouter votre premier modele" linking to `/models/new`

**Router (`App.tsx`):**
- Add route `/models/new` as a sibling **before** `/models/:slug`

**Mobile:** On `/models/new`, hide the bottom nav bar (no model context available).

### i18n Keys

Add to both `fr.json` and `en.json`:

```
createModel.title
createModel.subtitle
createModel.brand / .brandPlaceholder
createModel.name / .namePlaceholder
createModel.slug / .slugHint / .slugConflict
createModel.engineCc
createModel.imageUrl / .imageUrlHint
createModel.searchConfig (section title)
createModel.submit
createModel.success
createModel.errors.slugConflict
landing.addModel (for "+" card)
landing.addFirstModel (for empty state CTA)
catalog.noSeedAvailable (for non-Himalayan reset button)
```

## Phase 3 — CFMOTO 450MT Onboarding

No code changes. User workflow:

1. Create model via `/models/new` (brand: CFMOTO, name: 450MT, engine_cc: 449, keyword: "cfmoto 450mt")
2. Redirect to `/models/cfmoto-450mt/crawl`, launch a search
3. Extract a batch of ads (10-20) to get representative descriptions
4. Ask Claude to read the ads from database and identify accessories mentioned in descriptions
5. Build the accessory catalog for 450MT via `/models/cfmoto-450mt/catalog`
6. Run "Refresh accessories" on the extracted ads
7. Compare algorithmic detection vs human review — iterate on catalog patterns

**Empty state handling:** A newly created model has zero ads, zero catalog entries, zero variants. Existing pages handle this:
- Rankings: has empty state (`ranking.emptyTitle`)
- Stats: has empty state
- Catalog: has empty state (`catalog.emptyTitle`), but "Reset" button is hidden (no seed for this model)
- Crawl: shows search config and launch button (functional immediately after creation)

## Out of Scope

- Variant management UI (variants, consumables, new prices) — added later via Settings page
- Copying a catalog from one model to another — not needed yet
- `import-model` CLI endpoint implementation — superseded by the web UI approach
- Reordering models on landing page
- Model config editing UI (warranty, wear rates) — uses Himalayan defaults initially, tunable later via Settings
