# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BikeBargain — CLI tool + web UI to scrape, store, and analyze second-hand motorcycle listings from LeBonCoin (French classifieds). Supports multiple bike models (multi-brand marketplace). Written in French (comments, variable names). Frontend UI is internationalized (FR/EN) via react-i18next.

## Commands

```bash
# Setup
python3 -m venv .venv && source .venv/bin/activate && make install
make db                                               # Start PostgreSQL container

# Dev (backend + frontend, ports auto-detectes)
source .venv/bin/activate && make dev

# Dev proxy multi-worktree (une seule fois)
make proxy

# CLI commands (--model / -m flag; auto-selected when only 1 model)
python main.py add <url> [<url2> ...]            # Scrape and store listings
python main.py add -m himalayan-450 <url>        # Explicit model selection
python main.py list                               # List all stored listings
python main.py show <id>                          # Show listing detail
python main.py stats                              # Aggregate statistics
python main.py export                             # Export to CSV (export_annonces.csv)
python main.py import-model <file.json>           # Import a bike model config from JSON

# Run the analyzer/ranking report
python -m src.analyzer

# Backend API only
uvicorn src.api:app --reload --port 8000

# Frontend only
cd frontend && npm run dev

# Database migrations (Alembic)
alembic upgrade head                                  # Apply all pending migrations
alembic revision --autogenerate -m "description"      # Generate new migration from model changes
alembic downgrade -1                                  # Rollback last migration
alembic current                                       # Show current migration version

# Docker (PostgreSQL)
make db                                               # Start PostgreSQL container
make db-stop                                          # Stop PostgreSQL container
make db-reset                                         # Stop + delete volume (fresh start)

```

No test suite exists.

## Architecture

**Data flow (CLI):** LeBonCoin URL → `extractor.fetch_ad()` → confirmation interactive → `database.upsert_ad()` → PostgreSQL
**Data flow (Web):** LeBonCoin URL → `POST /api/bike-models/{slug}/ads/preview` → user review/edit → `POST /api/bike-models/{slug}/ads/confirm` → PostgreSQL

- `main.py` — CLI dispatcher (add/list/show/stats/export/import-model commands). `--model`/`-m` flag selects the bike model; auto-selects when only 1 model exists
- `src/config.py` — Centralized configuration via `pydantic-settings`. `Settings` class loaded from env vars + `.env` file. Cached via `@lru_cache`. Exposes `APP_ENV`, `DATABASE_URL`, `DEBUG`, `CORS_ORIGIN_REGEX`, `LBC_PROXY_URL`
- `src/extractor.py` — Fetches ads via the `lbc` library. Variant/color/wheel detection and new price estimation now driven by per-model DB config (`bike_variant_patterns`, `bike_model_configs`). `get_lbc_client()` factory creates `lbc.Client` with optional residential proxy
- `src/models.py` — SQLModel table models (ORM). Core ad tables: `Ad`, `AdAttribute`, `AdImage`, `AdAccessory`, `CrawlSession`, `CrawlSessionAd`, `AdPriceHistory`, `AccessoryOverride`. Bike model tables: `BikeModel`, `BikeModelConfig`, `BikeVariant`, `BikeConsumable`, `BikeAccessoryPattern`, `BikeVariantPattern`, `BikeNewListingPattern`, `BikeExclusionPattern`, `BikeSearchConfig`. All models use SQLModel (SQLAlchemy + Pydantic)
- `src/database.py` — Engine creation (PostgreSQL via `Settings.database_url`), session management (`get_session()` for FastAPI Depends), Alembic migration runner (`run_migrations()`), CRUD functions (`upsert_ad`, `get_all_ads`, `refresh_accessories`, etc.)
- `src/accessories.py` — Regex-based accessory detection with deduplication groups. Patterns loaded from `bike_accessory_patterns` DB table per model. `bike_exclusion_patterns` strips garage service text before detection. Each accessory has a new price estimate and a 65% depreciation rate for used value
- `src/analyzer.py` — Ranking algorithm: `effective_price = listed_price - accessories(used) + consumable_wear + mechanical_wear - warranty_value`. Analyzer constants (wear rates, warranty value) loaded from `bike_model_configs`. Run standalone via `python -m src.analyzer`
- `src/api.py` — FastAPI REST API with SQLModel sessions via `Depends(get_session)`. Runs `alembic upgrade head` at startup. All bike-scoped endpoints live under `/api/bike-models/{slug}/...`. New endpoints: `GET /api/bike-models` and `GET /api/bike-models/{slug}`. Old flat endpoints (`/api/ads`, `/api/stats`, etc.) kept as backward-compatible aliases (single-model only). CORS regex from `Settings.cors_origin_regex`. If `LBC_SERVICE_URL` is set, delegates LBC calls to the local service
- `src/lbc_service.py` — Micro-service FastAPI local pour le scraping LeBonCoin. Tourne sur la machine de l'utilisateur (IP residentielle). Expose `/search`, `/fetch-ad`, `/check-ad`, `/check-ads`
- `src/lbc_client.py` — Client HTTP (httpx) pour appeler le service LBC depuis l'API principale
- `devproxy.py` — Reverse proxy multi-worktree (stdlib only). Sert le frontend Vite du worktree actif sur localhost:3000. Dashboard à `/_proxy/`, API de contrôle à `/_proxy/api/`
- `devproxy_register.py` — Helper CLI : `find-ports` (détecte ports libres), `register`/`unregister` (s'enregistre auprès du proxy)
- `frontend/` — React 19 + TypeScript + Vite + Tailwind CSS v4 + TanStack Query v5 + Recharts + framer-motion. Proxies `/api` to backend via Vite config. Environment config via Vite `.env` files and `src/config.ts`
- `frontend/src/i18n/` — Internationalization via react-i18next. Translation files in `locales/fr.json` and `locales/en.json`. All UI strings use `t()` calls — never hardcode French text in components
- `frontend/src/pages/` — Landing page at `/` shows a model card grid. Model-scoped pages live under `/models/:slug/...`. `ModelLayout` wrapper provides model context to all child routes. Auto-redirect when only one model is configured

## Key Design Patterns

- **Multi-bike model**: all bike-specific configuration (accessories, variants, consumables, analyzer constants, search config, exclusion patterns, new-listing patterns) is stored in DB tables (`bike_*`) rather than hardcoded Python constants. A `BikeModel` row identified by a `slug` (e.g., `himalayan-450`) is the root anchor for all model-scoped data
- **Model routing (API)**: primary endpoints are `/api/bike-models/{slug}/ads`, `/api/bike-models/{slug}/stats`, etc. Legacy flat endpoints (`/api/ads`, `/api/stats`) remain as aliases for single-model backward compatibility
- **Model routing (frontend)**: landing page at `/` lists model cards. All feature pages are nested under `/models/:slug/`. `ModelLayout` fetches and injects the active `BikeModel` into context. When only one model exists, the app auto-redirects from `/` to `/models/{slug}/`
- **CLI model flag**: `--model` / `-m` accepts a slug. Omitting it auto-selects the single model or errors when multiple exist. `import-model` subcommand bootstraps a new model from a JSON config file
- **Accessory deduplication**: patterns stored in `bike_accessory_patterns` table use a `groupe_dedup` field. Specific patterns (e.g., "Crash bars SW-Motech") must appear before generic ones ("Crash bars") in the same group — first match wins
- **Variant detection priority**: version LBC attribute > title > body > color attribute fallback
- **Upsert logic**: ads are identified by LeBonCoin ID; re-adding an URL updates the existing record
- **Preview/confirm flow**: extraction is separated from persistence — user reviews and can modify variant, color, wheel type, and accessories before saving (both CLI and web UI)
- **Ad editing**: stored ads can be edited post-insertion via `PATCH /api/ads/{id}` (web) or CLI; changing variant/color/wheel_type triggers automatic new price recalculation
- **Sold tracking**: ads have a `sold` flag (0/1). Can be toggled manually per ad, or bulk-checked via `POST /api/ads/check-online` which tries to fetch each ad from LeBonCoin — inaccessible ads are marked sold. Sold ads remain in rankings (at their computed position) but are visually dimmed
- **Repost/duplicate detection**: during crawl, new ads are cross-checked against the database. Requires same city + price ±15% as prerequisites, then scores description similarity (Jaccard on significant words), accessories overlap, mileage proximity, and sold status. Threshold 80pts to avoid false positives. Lightweight pre-check at search time, full check at extraction time
- **Ad merging**: when a repost is detected, users can merge the new ad with the old one. This marks the old ad as sold, saves the new one with a `previous_ad_id` link, and copies + extends the price history. `POST /api/ads/merge`
- **Price history**: `ad_price_history` table tracks price changes across reposts. Displayed as a timeline on the ad detail page showing initial price, repost prices, deltas, and total evolution. Supports multiple consecutive reposts
- **ORM**: SQLModel (SQLAlchemy + Pydantic) for all database operations. Models in `src/models.py`, CRUD in `src/database.py`. No raw SQL
- **Environment config**: Backend uses `pydantic-settings` (`src/config.py`): env vars > `.env` file, cached `get_settings()`. Frontend uses Vite native `.env` mode: `.env` (shared defaults) + `.env.production` (prod defaults) + `.env.local` (gitignored overrides), accessed via `src/config.ts`. Two environments: `local` and `production`
- **Deployment**: Frontend on Vercel (root directory `frontend/`, SPA rewrites via `vercel.json`). Backend on Railway (Python auto-detected via `requirements.txt`, started via `Procfile`/`railway.json`). Railway provides `DATABASE_URL` via PostgreSQL plugin. `VITE_API_BASE_URL` set in Vercel env vars points to Railway backend URL. CORS configured on Railway via `CORS_ORIGIN_REGEX` to accept Vercel domain
- **Database**: PostgreSQL everywhere (local via Docker, production via Railway PostgreSQL plugin). Local container managed by `docker-compose.yml`, connection string in `.env`
- **Migrations**: Alembic for schema versioning. `alembic upgrade head` runs automatically at app startup (API and CLI). Migrations in `alembic/versions/`. Generate new migrations with `alembic revision --autogenerate -m "description"`
- **Seed data**: default data loaded via Alembic migration (`alembic/seed_data.json`), idempotent — skips if ads already exist. Bike model seed data (variants, accessories, consumables, etc.) is included in the same seed file under the `bike_models` key

## Reference Data

- `modeles-prix-neuf.md` — Full catalog of new prices (France, March 2026) with all variants, colors, and wheel types for the Himalayan 450 (used as seed data source)
- `BikeVariant` rows in DB — Authoritative programmatic source for new prices per model/variant/color/wheel combination
- Price reference (Himalayan 450): Base 5890€ → Mana Black 6590€

## LBC Service (mode split production)

En production, LeBonCoin bloque les IPs datacenter (Railway) via Datadome. L'architecture split delegue les appels LBC a un micro-service tournant sur une machine avec IP residentielle :

```
Frontend (Vercel) → API (Railway) → Service LBC (chez toi, Docker) → LeBonCoin
```

- `src/lbc_service.py` — Micro FastAPI avec 4 endpoints : `/search`, `/fetch-ad`, `/check-ad`, `/check-ads`
- `src/lbc_client.py` — Client HTTP utilise par l'API principale pour appeler le service LBC
- Si `LBC_SERVICE_URL` est defini, l'API delegue. Sinon, elle appelle LBC directement (mode local)

```bash
make lbc                    # Demarre le service LBC local (port 8001)
make tunnel                 # Demarre le service LBC + tunnel ngrok
```

Pour activer sur Railway : `railway variables set LBC_SERVICE_URL=https://ton-tunnel.com`

## Dev Proxy (multi-worktree)

Un proxy tourne sur localhost:3000. Quand tu lances `make dev` dans un worktree, les ports sont auto-détectés et le worktree s'enregistre au proxy.

Pour switcher le proxy vers ton worktree après `make dev` :
```bash
curl -X POST http://localhost:3000/_proxy/api/switch/<branch-name>
```

Le dashboard est accessible à http://localhost:3000/_proxy/
