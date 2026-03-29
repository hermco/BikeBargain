# Codebase Audit — Implementation Plan

**Date:** 2026-03-28
**Sources:** Architecture review, UX review, Backend review, Frontend review

## Consolidated Findings (Deduplicated)

Cross-referenced findings from 4 expert analyses. Issues appearing in multiple reviews are marked with their sources.

---

## Phase 1 — Critical Bugs & Data Integrity (Backend)

### 1.1 check-online marks ads as sold on ANY exception
**Sources:** Architect C4, Backend C1
**Risk:** A network timeout or Datadome block permanently flips all active ads to sold=1
**Fix:** Distinguish transient errors (timeout, 5xx, connection) from definitive 404. Only mark sold on confirmed gone.
**Files:** `src/api.py` (lines 496-499, 532-537), `src/lbc_service.py` (lines 77, 96-97)

### 1.2 upsert_ad overwrites all fields with None on partial updates
**Sources:** Architect H5, Backend C3
**Risk:** Re-fetching an ad silently NULLs fields not present in payload. merge_ad can lose data.
**Fix:** Use sentinel value — skip fields where key is absent from dict.
**Files:** `src/database.py` (lines 62-96)

### 1.3 merge_ad has a TOCTOU race condition (two commits)
**Source:** Backend H4
**Risk:** If second commit fails, new ad is saved but old ad is not marked superseded.
**Fix:** Refactor upsert_ad to not auto-commit, let caller manage transaction.
**Files:** `src/database.py`, `src/api.py` (lines 264-305)

### 1.4 rank_ads bypasses FastAPI DI with its own session
**Sources:** Architect C3, Backend C2
**Fix:** Add `session` parameter to `rank_ads()`, inject via Depends.
**Files:** `src/analyzer.py` (line 190), `src/api.py` (line 633)

---

## Phase 2 — Performance (Backend)

### 2.1 Add missing database indexes
**Sources:** Architect H8, H9
**Fix:** Add index on `AdImage.ad_id`, `Ad.sold`, `Ad.superseded_by`. Generate Alembic migration.
**Files:** `src/models.py`

### 2.2 Push filters/pagination into SQL for GET /api/ads
**Sources:** Architect C2, Backend H1
**Fix:** Build query with WHERE clauses for variant/price filters and LIMIT/OFFSET in SQL.
**Files:** `src/database.py`, `src/api.py` (lines 86-97)

### 2.3 Optimize _find_potential_duplicates with SQL pre-filter
**Sources:** Architect H6, Backend H2
**Fix:** Filter by city in SQL, load only candidate accessories. Remove full table scan.
**Files:** `src/api.py` (lines 879-999)

### 2.4 GET /api/stats — use SQL aggregation
**Sources:** Backend M3
**Fix:** Replace Python-level aggregation with SQL AVG/MIN/MAX/COUNT/GROUP BY.
**Files:** `src/api.py` (line 581), `src/database.py`

### 2.5 Bulk delete in refresh_accessories instead of N individual DELETEs
**Source:** Backend M2
**Fix:** Use `DELETE FROM ad_accessories WHERE ad_id IN (...)` single query.
**Files:** `src/database.py` (lines 183-188)

### 2.6 Fix median calculation (off-by-one for even-length lists)
**Source:** Backend L7
**Fix:** Use `statistics.median()`.
**Files:** `src/api.py` (line 617)

---

## Phase 3 — Frontend Bugs & i18n

### 3.1 Fix hardcoded French strings
**Sources:** UX H9, Frontend C1, H8, M19
**Fix:** Replace all hardcoded French text with `t()` calls:
- `LocationPicker.tsx:68` — "Votre ville..."
- `RankingPage.tsx:492` — "Trajet"
- `CrawlPage.tsx:892` — "Vendue"
- `AdDetailPage.tsx:266` — "l'annonce #"
- `Select.tsx:48` — "Sélectionner..."
- `geo.ts:91-96` — distance band labels
**Files:** Multiple frontend components + `fr.json` + `en.json`

### 3.2 formatPrice/formatDate/formatKm locale-aware
**Sources:** UX H8, Frontend H7
**Fix:** Accept locale parameter derived from `i18n.language`. Create a hook or pass locale at callsite.
**Files:** `frontend/src/lib/utils.ts`, all callsites

### 3.3 Extract VARIANTS/COLORS/WHEEL_TYPES to shared constants
**Sources:** UX M16, Frontend H9
**Fix:** Create `frontend/src/lib/constants.ts`, import from 3 files.
**Files:** `AdDetailPage.tsx`, `CrawlPage.tsx`, `AdForm.tsx`

### 3.4 Fix missing query invalidations
**Sources:** Frontend C2, C3
**Fix:** Add `onSuccess` with `queryClient.invalidateQueries` to `useCheckPrices`, `useUpdateCrawlAdAction`, `useRemoveCrawlSessionAd`.
**Files:** `frontend/src/hooks/queries.ts`

### 3.5 Fix AdDetailPage 404/error state
**Sources:** UX C3, Frontend H11
**Fix:** Replace bare `<p>` with EmptyState component + back link.
**Files:** `frontend/src/pages/AdDetailPage.tsx` (line 66)

### 3.6 Type previewData properly as AdDetail
**Source:** Frontend M18
**Fix:** Change `Record<string, unknown>` to `AdDetail | null` in AdForm and CrawlPage.
**Files:** `frontend/src/components/AdForm.tsx`, `frontend/src/pages/CrawlPage.tsx`

### 3.7 Fix Ad.sold type inconsistency
**Sources:** Frontend H10, Architect L20
**Fix:** Normalize to `0 | 1` in types.ts for consistency with backend.
**Files:** `frontend/src/types.ts`

---

## Phase 4 — UX Improvements

### 4.1 Fix sidebar "Add Ad" button (dead link)
**Source:** UX C1
**Fix:** Wire to open AdForm dialog via shared state/URL param, or change label.
**Files:** `frontend/src/components/Sidebar.tsx`, `frontend/src/pages/AdsPage.tsx`

### 4.2 Check Prices button available in 'done' state
**Source:** UX C2
**Fix:** Extend render condition to include `status === 'done'`.
**Files:** `frontend/src/pages/CrawlPage.tsx` (lines 706-724)

### 4.3 Lightbox accessibility
**Sources:** UX H5, Frontend M16
**Fix:** Add `role="dialog"`, `aria-modal`, `aria-label`, visible close button, focus trap.
**Files:** `frontend/src/pages/AdDetailPage.tsx` (lines 331-357)

### 4.4 AdForm dialog sticky footer
**Source:** UX M17
**Fix:** Flex column layout with `sticky bottom-0` for action buttons.
**Files:** `frontend/src/components/AdForm.tsx`

### 4.5 Inline font-family → Tailwind utility
**Source:** Frontend H6
**Fix:** Create `@utility font-fraunces` in index.css, replace all inline styles.
**Files:** `frontend/src/index.css`, 7+ component files

### 4.6 Mobile bottom nav — remove language toggle (6→5 items)
**Source:** UX H4
**Fix:** Remove MobileLanguageToggle from bottom nav.
**Files:** `frontend/src/components/Sidebar.tsx`

### 4.7 Mileage gauge dynamic max
**Source:** UX H6
**Fix:** Use 50,000 km as reference (domain-appropriate for H450) instead of 30,000.
**Files:** `frontend/src/components/AdCard.tsx` (line 107)

### 4.8 Toast position above mobile nav
**Source:** UX L19
**Fix:** Adjust bottom offset on mobile to clear the nav bar.
**Files:** `frontend/src/components/Toast.tsx`

### 4.9 AdDetailPage id validation
**Source:** Frontend M22
**Fix:** Guard against NaN before calling useAd.
**Files:** `frontend/src/pages/AdDetailPage.tsx`

---

## Phase 5 — Architecture Improvements

### 5.1 Typed Pydantic models for ad payloads
**Sources:** Architect M14, Backend H7
**Fix:** Define `AdPayload` schema, replace `dict` in ConfirmAdRequest/MergeAdRequest.
**Files:** `src/api.py`

### 5.2 Error boundaries in frontend
**Source:** Frontend architecture
**Fix:** Add top-level ErrorBoundary in App.tsx.
**Files:** `frontend/src/App.tsx`, new `ErrorBoundary.tsx`

### 5.3 RankingPage memoization
**Sources:** Frontend M13, M14
**Fix:** Wrap filtered/sorted in useMemo, pre-compute rank map.
**Files:** `frontend/src/pages/RankingPage.tsx`

### 5.4 CrawlPage processNext stale closure fix
**Source:** Frontend H4
**Fix:** Use sessionIdRef to always read latest value.
**Files:** `frontend/src/pages/CrawlPage.tsx`

### 5.5 startTransition naming conflict
**Source:** Frontend H5
**Fix:** Rename to `startCrawlTransition`.
**Files:** `frontend/src/pages/CrawlPage.tsx`

---

## Execution Order

Phases 1-3 are the priority (bugs, data integrity, performance, i18n). Phases 4-5 are polish.
Each phase can be executed by parallel agents working on independent file sets.
