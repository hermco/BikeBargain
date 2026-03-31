# Ad Status Tracking Design

## Summary

Replace the binary `sold` flag (0/1) with a tri-state `status` field (`online`, `paused`, `sold`) to reflect LeBonCoin's actual ad states. Add status history tracking and a "full check" mode that re-verifies previously sold/paused ads to detect returns online.

## Context

LeBonCoin ads have 3 states:
- **active** — ad is live and visible
- **paused** — seller temporarily paused the ad (may come back)
- **deleted/inaccessible** — ad removed, likely sold

Currently, the system treats everything non-active as "sold" and never re-checks sold ads. This loses information (paused vs sold) and can't detect ads returning online.

## Design

### 1. Data Model Changes

**Important:** `Ad.status` (line 204) already exists and stores the raw LBC status from extraction. The new field is named `listing_status` to avoid collision.

**Ad model** (`src/models.py`):
- Remove: `sold: int = Field(default=0, index=True)`
- Add: `listing_status: str = Field(default="online", index=True)` — values: `"online"`, `"paused"`, `"sold"`

**New table `ad_status_history`** (`src/models.py`):
```python
class AdStatusHistory(SQLModel, table=True):
    __tablename__ = "ad_status_history"
    id: int | None = Field(default=None, primary_key=True)
    ad_id: int = Field(sa_column=Column(BigInteger, ForeignKey("ads.id"), index=True))
    old_status: str  # "online", "paused", "sold"
    new_status: str
    reason: str | None = None  # e.g. "status=paused", "inaccessible", "manual"
    changed_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    ad: Ad = Relationship()
```

**Alembic migration**:
- Add `status` column with default `"online"`
- Backfill: `UPDATE ads SET status = 'sold' WHERE sold = 1`
- Backfill: `UPDATE ads SET status = 'online' WHERE sold = 0`
- Drop `sold` column
- Create `ad_status_history` table

### 2. LBC Status Mapping

LBC service returns `status` attribute and `NotFoundError`. Mapping:

| LBC response | App status |
|---|---|
| `status="active"` | `online` |
| `status="paused"` | `paused` |
| `status="deleted"` | `sold` |
| `NotFoundError` (inaccessible) | `sold` |
| Any other non-active status | `sold` |

The `lbc_service.py` endpoints (`/check-ad`, `/check-ads`) already return the raw `status` or `"inaccessible"`. No changes needed there — the mapping happens in `api.py`.

### 3. API Changes

**Check endpoints** — two modes:

`POST /api/bike-models/{slug}/ads/check-online` (existing, modified):
- Checks only `status="online"` ads (quick check, same as today)
- Maps LBC status to app status
- Logs transitions to `ad_status_history`
- Response shape change:
```json
{
  "checked": 42,
  "changes": 3,
  "details": [
    {"id": 123, "status": "paused", "previous_status": "online", "reason": "status=paused"},
    {"id": 456, "status": "sold", "previous_status": "online", "reason": "inaccessible"},
    {"id": 789, "status": "online"}
  ]
}
```

`POST /api/bike-models/{slug}/ads/check-online-full` (new):
- Checks ALL ads regardless of current status
- Can detect ads returning from `paused`/`sold` to `online`
- Same response shape
- Response additionally includes `"back_online": N` count

`POST /api/bike-models/{slug}/ads/{ad_id}/check-online` (existing, modified):
- Same status mapping logic, updated response shape

**PATCH /api/ads/{id}** (existing, modified):
- Accept `status` instead of `sold`
- Log manual status changes to `ad_status_history` with `reason="manual"`

**GET endpoints** (rankings, ads list, stats):
- Return `status` string instead of `sold` int/bool
- Rankings sort: online ads first, then paused, then sold (current sort by sold 0/1 becomes sort by status priority)

**Legacy compat endpoints** (`/api/ads/check-online`, etc.):
- Update to use new status field internally

### 4. Frontend Changes

**TypeScript types** (`frontend/src/types.ts`):
- `Ad.sold: number` → `Ad.status: "online" | "paused" | "sold"`
- `Ranking.sold: boolean` → `Ranking.status: "online" | "paused" | "sold"`

**Visual treatment** (3 distinct states):
- **Online**: default appearance (no badge)
- **Paused**: amber/yellow styling — `bg-amber-500/20`, amber border, "En pause" / "Paused" badge. Opacity reduced but less than sold (e.g., `opacity-70`)
- **Sold**: red styling as today — `bg-red-500/20`, red border, "Vendue" / "Sold" badge, `opacity-50`

**RankingPage** (`frontend/src/pages/RankingPage.tsx`):
- Two check buttons: "Check rapide" (existing icon) + "Check complet" (new, different icon or label)
- Filter toggle expanded: "Masquer vendues" becomes a dropdown or segmented control: Show all / Hide paused / Hide sold / Hide both
- "Back online" toast when full check detects returns
- Paused rows: amber left border, amber badge, slight opacity reduction

**AdsPage** (`frontend/src/pages/AdsPage.tsx`):
- Same two-button pattern
- KPI stats: show online / paused / sold counts instead of just sold count

**AdDetailPage** (`frontend/src/pages/AdDetailPage.tsx`):
- Status toggle becomes a 3-state selector (online / paused / sold) for manual override
- Status banner: amber for paused ("Cette moto est en pause"), red for sold (existing)
- Status history timeline displayed below the price history (or in a dedicated tab/section)

**AdCard** (`frontend/src/components/AdCard.tsx`):
- Badge color varies by status

**i18n** — new keys:
- `common.paused`: "En pause" / "Paused"
- `common.online`: "En ligne" / "Online"
- `ads.paused`: "En pause" / "Paused" (count label)
- `adDetail.markPaused`: "Marquer en pause" / "Mark as paused"
- `adDetail.markedPaused`: "Annonce marquee en pause" / "Listing marked as paused"
- `adDetail.pausedBanner`: "Cette moto est en pause sur LeBonCoin." / "This motorcycle is paused on LeBonCoin."
- `adDetail.backOnline`: "Retour en ligne" / "Back online"
- `ranking.checkFull`: "Check complet" / "Full check"
- `ranking.checkQuick`: "Check rapide" / "Quick check"
- `ranking.backOnline_one`: "{{count}} annonce de retour en ligne" / "{{count}} listing back online"
- `ranking.backOnline_other`: "{{count}} annonces de retour en ligne" / "{{count}} listings back online"
- `ranking.hidePaused`: "Masquer en pause" / "Hide paused"
- Update existing `hideSold` to remain as-is (hide sold only)

### 5. Analyzer Changes

`src/analyzer.py`:
- Replace `"sold": bool(ad.get("sold", 0))` with `"sold": ad.get("status") == "sold"`
- Add `"paused": ad.get("status") == "paused"` if rankings need it
- Sorting: online first (priority 0), paused second (priority 1), sold last (priority 2)

### 6. Status History Display

On AdDetailPage, below or alongside price history:
- Timeline showing status transitions: date, old status, new status, reason
- Visual: colored dots (green=online, amber=paused, red=sold) connected by a line
- Keep it simple — a small list/table is fine for v1

### 7. Migration Strategy

Single Alembic migration that:
1. Adds `status` column (VARCHAR, default "online")
2. Backfills from `sold`: `0 → "online"`, `1 → "sold"`
3. Drops `sold` column
4. Creates `ad_status_history` table

This is a breaking change — backend and frontend must deploy together. Since both are controlled (Railway + Vercel), this is fine.

## Files to Modify

### Backend
- `src/models.py` — Ad model: replace `sold` with `status`, add `AdStatusHistory`
- `src/api.py` — All endpoints referencing `sold`, check-online logic, new full-check endpoint
- `src/analyzer.py` — Replace `sold` references
- `src/lbc_service.py` — Return raw LBC status for better mapping (already does this)
- `alembic/versions/` — New migration

### Frontend
- `frontend/src/types.ts` — Update Ad and Ranking interfaces
- `frontend/src/lib/api.ts` — Update API functions, add `checkAdsOnlineFull`
- `frontend/src/hooks/queries.ts` — Update mutations, add full-check mutation
- `frontend/src/pages/RankingPage.tsx` — Two buttons, status-based styling, filter changes
- `frontend/src/pages/AdsPage.tsx` — Two buttons, KPI stats
- `frontend/src/pages/AdDetailPage.tsx` — 3-state toggle, status banner, status history
- `frontend/src/components/AdCard.tsx` — Status-based badge
- `frontend/src/i18n/locales/fr.json` — New translation keys
- `frontend/src/i18n/locales/en.json` — New translation keys

### Docs
- `CLAUDE.md` — Update architecture description (status field instead of sold)
