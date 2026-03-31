# Editable Search Config — Design Spec

**Date:** 2026-03-31
**Status:** Approved

## Goal

Allow users to edit the LeBonCoin search parameters (stored in `bike_search_configs`) via the web UI. A full CRUD settings page manages configurations persistently, and the crawl page shows a compact summary with a link to settings.

## Data Model

Extend `BikeSearchConfig` with 6 new nullable columns:

| Field | Type | DB Column | Notes |
|-------|------|-----------|-------|
| `locations` | `list[str] \| None` | `JSON` | Department codes ("67") or region names ("ILE_DE_FRANCE") |
| `owner_type` | `str \| None` | `VARCHAR` | "private", "pro", "all" |
| `price_min` | `int \| None` | `INTEGER` | Min price filter |
| `price_max` | `int \| None` | `INTEGER` | Max price filter |
| `sort` | `str \| None` | `VARCHAR` | "relevance", "newest", "oldest", "cheapest", "expensive" |
| `search_in_title_only` | `bool` | `BOOLEAN` | Default `False` |

All new columns are nullable with defaults (no breaking change). Single Alembic migration.

## API Endpoints

CRUD under `/api/bike-models/{slug}/search-configs`:

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/search-configs` | List all search configs for the model |
| `POST` | `/search-configs` | Create a new search config |
| `PATCH` | `/search-configs/{id}` | Update an existing search config |
| `DELETE` | `/search-configs/{id}` | Delete a search config |

### Request Schemas

**Create/Update body:**

```
keyword: str (required on create, optional on update)
min_cc: int | None
max_cc: int | None
locations: list[str] | None
owner_type: "private" | "pro" | "all" | None
price_min: int | None
price_max: int | None
sort: "relevance" | "newest" | "oldest" | "cheapest" | "expensive" | None
search_in_title_only: bool (default False)
```

**Validation:**
- `keyword` required and non-empty on create
- `price_min` <= `price_max` when both set
- `min_cc` <= `max_cc` when both set
- `owner_type` must be one of the allowed values
- `sort` must be one of the allowed values
- `locations` entries validated against known lbc Department/Region codes

## Crawler Changes

### `src/crawler.py` — `search_all_ads()`

Extend signature to accept all new parameters. Map to `lbc.Client.search()` kwargs:
- `locations` → `lbc.Department` / `lbc.Region` enum lookups
- `owner_type` → `lbc.OwnerType` enum
- `sort` → `lbc.Sort` enum
- `price` → `(price_min, price_max)` tuple via kwargs
- `search_in_title_only` → direct pass-through

### `src/lbc_service.py` — `SearchRequest`

Extend the Pydantic model with the same new fields. Pass them through to `search_all_ads()`.

### `src/lbc_client.py` — `search()`

Extend the POST body to include the new fields.

### `src/api.py` — crawl search endpoint

Read new fields from each `BikeSearchConfig` row and pass to crawler/lbc_client.

## Frontend

### Settings Page (`/models/:slug/settings`)

New route and page component. Contains a "Search Configuration" section:
- Card list of existing search configs
- Each card shows all configured parameters in a readable format
- Inline edit mode (click to edit, save/cancel)
- Add new config button
- Delete with confirmation
- Form fields: keyword (text), min/max cc (number), locations (multi-select of departments/regions), owner_type (select), price min/max (number), sort (select), title-only (toggle)

### Crawl Page Summary

Above the "Start Search" button in `CrawlPage.tsx`:
- Compact summary: number of configs, keywords, key filters
- Link to settings page for editing
- Warning state if no search configs exist

### Navigation

Add "Settings" link to the model navigation/layout.

### API Layer

New functions in `frontend/src/lib/api.ts`:
- `getSearchConfigs(slug)` — GET
- `createSearchConfig(slug, data)` — POST
- `updateSearchConfig(slug, id, data)` — PATCH
- `deleteSearchConfig(slug, id)` — DELETE

New hooks in `frontend/src/hooks/queries.ts`:
- `useSearchConfigs(slug)` — query
- `useCreateSearchConfig(slug)` — mutation
- `useUpdateSearchConfig(slug)` — mutation
- `useDeleteSearchConfig(slug)` — mutation

### i18n

All new UI strings added to both `locales/fr.json` and `locales/en.json`.

## Seed Data

Existing seed entries in `alembic/seed_data.json` gain the new fields with null/default values. No migration of existing data needed (columns are nullable).

## Out of Scope

- Location autocomplete/search (use a static list of regions/departments from lbc enums)
- Per-crawl override of search configs (future feature)
- URL-based search (lbc supports `url` param — not exposed for now)
