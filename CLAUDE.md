# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CLI tool + web UI to scrape, store, and analyze second-hand Royal Enfield Himalayan 450 listings from LeBonCoin (French classifieds). Written in French (comments, variable names). Frontend UI is internationalized (FR/EN) via react-i18next.

## Commands

```bash
# Setup
python3 -m venv .venv && source .venv/bin/activate && make install

# Dev (backend :8000 + frontend :5173)
source .venv/bin/activate && make dev

# CLI commands
python main.py add <url> [<url2> ...]   # Scrape and store listings
python main.py list                      # List all stored listings
python main.py show <id>                 # Show listing detail
python main.py stats                     # Aggregate statistics
python main.py export                    # Export to CSV (export_annonces.csv)

# Run the analyzer/ranking report
python -m src.analyzer

# Backend API only
uvicorn src.api:app --reload --port 8000

# Frontend only
cd frontend && npm run dev
```

No test suite exists.

## Architecture

**Data flow (CLI):** LeBonCoin URL → `extractor.fetch_ad()` → confirmation interactive → `database.upsert_ad()` → SQLite
**Data flow (Web):** LeBonCoin URL → `POST /api/ads/preview` → user review/edit → `POST /api/ads/confirm` → SQLite

- `main.py` — CLI dispatcher (add/list/show/stats/export commands)
- `src/extractor.py` — Fetches ads via the `lbc` library, detects variant/color/wheel type using regex patterns against `VARIANT_PATTERNS`, estimates new price from `NEW_PRICES` catalog
- `src/database.py` — SQLite schema (4 tables: `ads`, `ad_attributes`, `ad_images`, `ad_accessories`) and CRUD. `refresh_accessories()` re-runs detection on all stored ads (useful after pattern updates)
- `src/accessories.py` — Regex-based accessory detection with deduplication groups. Patterns are ordered specific-before-generic within each group. `EXCLUSION_PATTERNS` strips garage service text before detection. Each accessory has a new price estimate and a 65% depreciation rate for used value
- `src/analyzer.py` — Ranking algorithm: `effective_price = listed_price - accessories(used) + consumable_wear + mechanical_wear - warranty_value`. Run standalone via `python -m src.analyzer`
- `src/api.py` — FastAPI REST API exposing all functions (ads CRUD, stats, rankings, CSV export). CORS enabled for localhost:5173. Includes preview/confirm workflow (`POST /api/ads/preview`, `POST /api/ads/confirm`), ad editing (`PATCH /api/ads/{id}`), accessory catalog (`GET /api/accessory-catalog`), and sold status check (`POST /api/ads/check-online`)
- `frontend/` — React 19 + TypeScript + Vite + Tailwind CSS v4 + TanStack Query v5 + Recharts + framer-motion. Proxies `/api` to backend via Vite config
- `frontend/src/i18n/` — Internationalization via react-i18next. Translation files in `locales/fr.json` and `locales/en.json`. All UI strings use `t()` calls — never hardcode French text in components

## Key Design Patterns

- **Accessory deduplication**: `ACCESSORY_PATTERNS` uses a `groupe_dedup` field. Specific patterns (e.g., "Crash bars SW-Motech") must appear before generic ones ("Crash bars") in the same group — first match wins
- **Variant detection priority**: version LBC attribute > title > body > color attribute fallback
- **Upsert logic**: ads are identified by LeBonCoin ID; re-adding an URL updates the existing record
- **Preview/confirm flow**: extraction is separated from persistence — user reviews and can modify variant, color, wheel type, and accessories before saving (both CLI and web UI)
- **Ad editing**: stored ads can be edited post-insertion via `PATCH /api/ads/{id}` (web) or CLI; changing variant/color/wheel_type triggers automatic new price recalculation
- **Sold tracking**: ads have a `sold` flag (0/1). Can be toggled manually per ad, or bulk-checked via `POST /api/ads/check-online` which tries to fetch each ad from LeBonCoin — inaccessible ads are marked sold. Sold ads remain in rankings (at their computed position) but are visually dimmed
- **Repost/duplicate detection**: during crawl, new ads are cross-checked against the database. Requires same city + price ±15% as prerequisites, then scores description similarity (Jaccard on significant words), accessories overlap, mileage proximity, and sold status. Threshold 80pts to avoid false positives. Lightweight pre-check at search time, full check at extraction time
- **Ad merging**: when a repost is detected, users can merge the new ad with the old one. This marks the old ad as sold, saves the new one with a `previous_ad_id` link, and copies + extends the price history. `POST /api/ads/merge`
- **Price history**: `ad_price_history` table tracks price changes across reposts. Displayed as a timeline on the ad detail page showing initial price, repost prices, deltas, and total evolution. Supports multiple consecutive reposts
- **SQLite**: WAL mode, foreign keys ON, `row_factory = sqlite3.Row` for dict-like access

## Reference Data

- `modeles-prix-neuf.md` — Full catalog of new prices (France, March 2026) with all variants, colors, and wheel types
- `NEW_PRICES` dict in `extractor.py` — Simplified version used for programmatic price lookup
- Price reference: Base 5890€ → Mana Black 6590€
