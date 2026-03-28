# In-Place Price Change Detection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect and confirm in-place price changes on existing LeBonCoin ads, both during crawl and via a manual "check prices" action.

**Architecture:** Extend the existing crawl flow with a 3rd result category ("price updated"). Add a `POST /api/ads/check-prices` endpoint that re-fetches non-sold ads and returns price deltas. Add `POST /api/ads/{id}/confirm-price` to persist confirmed changes with price history. Frontend gets a "Check prices" button on the Crawl page and a new confirmation card section.

**Tech Stack:** Python/FastAPI (backend), React 19 + TypeScript + TanStack Query (frontend), SQLModel (ORM), react-i18next (i18n)

---

## File Map

**Backend (modify):**
- `src/api.py` — Add `confirm-price` and `check-prices` endpoints, modify `crawl_search` to flag price changes
- `src/lbc_service.py` — Add `/check-prices` endpoint (fetch ads + return prices)
- `src/lbc_client.py` — Add `check_prices()` function

**Frontend (modify):**
- `frontend/src/types.ts` — Add `'price_update'` to `PriceHistoryEntry.source`, add `PriceChangeResult` type
- `frontend/src/lib/api.ts` — Add `checkPrices()` and `confirmPrice()` API functions
- `frontend/src/hooks/queries.ts` — Add `useCheckPrices()` and `useConfirmPrice()` hooks
- `frontend/src/pages/CrawlPage.tsx` — Add "Check prices" button, price change confirmation section
- `frontend/src/pages/AdDetailPage.tsx` — Add `price_update` source rendering in timeline
- `frontend/src/i18n/locales/fr.json` — French translations
- `frontend/src/i18n/locales/en.json` — English translations

---

### Task 1: Backend — `POST /api/ads/{id}/confirm-price` endpoint

**Files:**
- Modify: `src/api.py:234` (after the Merge / Price History section header)

- [ ] **Step 1: Add the Pydantic schema and endpoint**

Add after the `get_price_history` endpoint (line 337) in `src/api.py`:

```python
class ConfirmPriceRequest(BaseModel):
    new_price: float


@app.post("/api/ads/{ad_id}/confirm-price")
def confirm_price(ad_id: int, req: ConfirmPriceRequest, session: Session = Depends(get_session)):
    ad = session.get(Ad, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Annonce non trouvee")

    old_price = ad.price or 0
    new_price = req.new_price
    if old_price == new_price:
        return {"id": ad_id, "price_delta": 0, "message": "Prix inchange"}

    # Creer l'entree initiale si aucun historique n'existe
    existing_history = session.exec(
        select(AdPriceHistory).where(AdPriceHistory.ad_id == ad_id)
    ).first()

    if not existing_history:
        session.add(AdPriceHistory(
            ad_id=ad_id,
            price=old_price,
            source="initial",
            note=f"Annonce #{ad_id}",
            recorded_at=ad.first_publication_date or ad.extracted_at or "",
        ))

    # Enregistrer le changement de prix
    price_delta = int(new_price - old_price)
    if price_delta < 0:
        note = f"Baisse de {abs(price_delta)}€"
    else:
        note = f"Hausse de {price_delta}€"

    session.add(AdPriceHistory(
        ad_id=ad_id,
        price=new_price,
        source="price_update",
        note=note,
        recorded_at=datetime.now().isoformat(),
    ))

    ad.price = new_price
    ad.updated_at = datetime.now().isoformat()
    session.commit()

    return {"id": ad_id, "price_delta": price_delta, "new_price": new_price}
```

- [ ] **Step 2: Verify the endpoint loads**

Run: `cd /Users/corentinhermet/Work/himalayan-450-analyzer && source .venv/bin/activate && python -c "from src.api import app; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/api.py
git commit -m "feat: add POST /api/ads/{id}/confirm-price endpoint"
```

---

### Task 2: Backend — LBC service + client for price checking

**Files:**
- Modify: `src/lbc_service.py:81` (after check-ads)
- Modify: `src/lbc_client.py:44` (after check_ads)

- [ ] **Step 1: Add `/check-prices` endpoint to lbc_service.py**

Add at the end of `src/lbc_service.py`:

```python
@app.post("/check-prices")
def check_prices(req: CheckAdsRequest):
    """Recupere le prix actuel de chaque annonce."""
    from .extractor import get_lbc_client

    client = get_lbc_client()
    results = []
    for ad_id in req.ad_ids:
        try:
            lbc_ad = client.get_ad(ad_id)
            status = getattr(lbc_ad, "status", None)
            if status and status not in ("active",):
                results.append({"ad_id": ad_id, "online": False, "price": None})
            else:
                price = getattr(lbc_ad, "price", None)
                results.append({"ad_id": ad_id, "online": True, "price": price})
        except Exception:
            results.append({"ad_id": ad_id, "online": False, "price": None})
    return {"results": results}
```

- [ ] **Step 2: Add `check_prices()` to lbc_client.py**

Add at the end of `src/lbc_client.py`:

```python
def check_prices(ad_ids: list[int]) -> list[dict]:
    """Recupere les prix actuels via le service local."""
    r = httpx.post(f"{_base_url()}/check-prices", json={"ad_ids": ad_ids}, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()["results"]
```

- [ ] **Step 3: Verify imports**

Run: `cd /Users/corentinhermet/Work/himalayan-450-analyzer && source .venv/bin/activate && python -c "from src.lbc_service import app; from src.lbc_client import check_prices; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/lbc_service.py src/lbc_client.py
git commit -m "feat: add check-prices endpoint to LBC service and client"
```

---

### Task 3: Backend — `POST /api/ads/check-prices` endpoint

**Files:**
- Modify: `src/api.py` (after the `check_ad_online` endpoint, ~line 487)

- [ ] **Step 1: Add the check-prices endpoint**

Add after the `check_ad_online` endpoint in `src/api.py`:

```python
@app.post("/api/ads/check-prices")
def check_prices(session: Session = Depends(get_session)):
    ads = session.exec(select(Ad).where(Ad.sold == 0)).all()
    if not ads:
        return {"price_changes": [], "checked_count": 0, "unchanged_count": 0}

    price_changes = []

    if settings.lbc_service_url:
        from . import lbc_client
        results = lbc_client.check_prices([ad.id for ad in ads])
        ads_by_id = {ad.id: ad for ad in ads}
        for r in results:
            if not r["online"] or r["price"] is None:
                continue
            ad = ads_by_id[r["ad_id"]]
            if ad.price is not None and r["price"] != ad.price:
                price_changes.append({
                    "id": ad.id,
                    "subject": ad.subject,
                    "current_price": ad.price,
                    "new_price": r["price"],
                    "price_delta": int(r["price"] - ad.price),
                    "city": ad.city,
                    "department": ad.department,
                    "url": ad.url,
                })
    else:
        from .extractor import get_lbc_client
        client = get_lbc_client()
        for ad in ads:
            try:
                lbc_ad = client.get_ad(ad.id)
                ad_status = getattr(lbc_ad, "status", None)
                if ad_status and ad_status not in ("active",):
                    continue
                lbc_price = getattr(lbc_ad, "price", None)
                if lbc_price is not None and ad.price is not None and lbc_price != ad.price:
                    price_changes.append({
                        "id": ad.id,
                        "subject": ad.subject,
                        "current_price": ad.price,
                        "new_price": lbc_price,
                        "price_delta": int(lbc_price - ad.price),
                        "city": ad.city,
                        "department": ad.department,
                        "url": ad.url,
                    })
            except Exception:
                continue

    return {
        "price_changes": price_changes,
        "checked_count": len(ads),
        "unchanged_count": len(ads) - len(price_changes),
    }
```

- [ ] **Step 2: Verify the endpoint loads**

Run: `cd /Users/corentinhermet/Work/himalayan-450-analyzer && source .venv/bin/activate && python -c "from src.api import app; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/api.py
git commit -m "feat: add POST /api/ads/check-prices endpoint"
```

---

### Task 4: Backend — Detect price changes during crawl search

**Files:**
- Modify: `src/api.py` — `crawl_search` function (~line 554)

- [ ] **Step 1: Add price comparison for existing ads in crawl_search**

In the `crawl_search` function, after the line `ad["exists_in_db"] = ad["id"] in existing_ids` (line 586), add price change detection. The `db_ads` query is already done above. We need to add price lookup for existing ads.

Find this block in `crawl_search` (around lines 585-619):
```python
    for ad in results["ads"]:
        ad["exists_in_db"] = ad["id"] in existing_ids
        ad["possible_repost_of"] = None

        if ad["id"] not in existing_ids:
```

Replace with:
```python
    # Index des prix en base pour detecter les changements
    db_prices = {a.id: a.price for a in db_ads}

    for ad in results["ads"]:
        ad["exists_in_db"] = ad["id"] in existing_ids
        ad["possible_repost_of"] = None
        ad["price_changed"] = False
        ad["current_db_price"] = None
        ad["price_delta"] = None

        # Detecter les changements de prix sur les annonces deja en base
        if ad["id"] in existing_ids:
            db_price = db_prices.get(ad["id"])
            ad_price = ad.get("price")
            if db_price is not None and ad_price is not None and db_price != ad_price:
                ad["price_changed"] = True
                ad["current_db_price"] = db_price
                ad["price_delta"] = int(ad_price - db_price)

        if ad["id"] not in existing_ids:
```

- [ ] **Step 2: Verify the endpoint loads**

Run: `cd /Users/corentinhermet/Work/himalayan-450-analyzer && source .venv/bin/activate && python -c "from src.api import app; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/api.py
git commit -m "feat: detect price changes on existing ads during crawl search"
```

---

### Task 5: Frontend — Types and API functions

**Files:**
- Modify: `frontend/src/types.ts:187`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Update PriceHistoryEntry source type**

In `frontend/src/types.ts`, line 187, change:
```typescript
  source: 'initial' | 'repost' | 'manual'
```
to:
```typescript
  source: 'initial' | 'repost' | 'manual' | 'price_update'
```

- [ ] **Step 2: Add PriceChangeResult type and update CrawlAdSummary**

In `frontend/src/types.ts`, add after `PriceHistory` interface (after line 197):

```typescript
export interface PriceChangeEntry {
  id: number
  subject: string | null
  current_price: number
  new_price: number
  price_delta: number
  city: string | null
  department: string | null
  url: string | null
}

export interface CheckPricesResult {
  price_changes: PriceChangeEntry[]
  checked_count: number
  unchanged_count: number
}
```

Update `CrawlAdSummary` (line 139-151) — add the new fields:
```typescript
export interface CrawlAdSummary {
  id: number
  url: string
  subject: string | null
  price: number | null
  city: string | null
  department: string | null
  thumbnail: string | null
  exists_in_db: boolean
  possible_repost_of: CrawlRepostMatch | null
  is_new_listing?: boolean
  price_changed?: boolean
  current_db_price?: number | null
  price_delta?: number | null
}
```

- [ ] **Step 3: Add API functions**

In `frontend/src/lib/api.ts`, add the import of `CheckPricesResult` at line 1:
```typescript
import type { AdsResponse, AdDetail, Stats, Ranking, CrawlSearchResult, CrawlExtractResult, PriceHistory, CheckPricesResult } from '../types'
```

Add before the `// --- Crawl` section (before line 147):
```typescript
export function checkPrices(): Promise<CheckPricesResult> {
  return fetchJSON<CheckPricesResult>('/ads/check-prices', { method: 'POST' })
}

export function confirmPrice(adId: number, newPrice: number): Promise<{ id: number; price_delta: number; new_price: number }> {
  return fetchJSON(`/ads/${adId}/confirm-price`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_price: newPrice }),
  })
}
```

- [ ] **Step 4: Add query hooks**

In `frontend/src/hooks/queries.ts`, add before the `// --- Crawl` section (before line 211):

```typescript
export function useCheckPrices() {
  return useMutation({
    mutationFn: () => api.checkPrices(),
  })
}

export function useConfirmPrice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ adId, newPrice }: { adId: number; newPrice: number }) =>
      api.confirmPrice(adId, newPrice),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['ad', vars.adId] })
      void qc.invalidateQueries({ queryKey: ['ads'] })
      void qc.invalidateQueries({ queryKey: ['stats'] })
      void qc.invalidateQueries({ queryKey: ['rankings'] })
      void qc.invalidateQueries({ queryKey: ['price-history', vars.adId] })
    },
  })
}
```

- [ ] **Step 5: Verify build**

Run: `cd /Users/corentinhermet/Work/himalayan-450-analyzer/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types.ts frontend/src/lib/api.ts frontend/src/hooks/queries.ts
git commit -m "feat: add price check types, API functions, and query hooks"
```

---

### Task 6: Frontend — i18n translations

**Files:**
- Modify: `frontend/src/i18n/locales/fr.json`
- Modify: `frontend/src/i18n/locales/en.json`

- [ ] **Step 1: Add French translations**

In `frontend/src/i18n/locales/fr.json`, in the `"crawl"` section (before the closing `}` of crawl, around line 251), add:

```json
    "checkPrices": "Vérifier les prix",
    "checkingPrices": "Vérification des prix...",
    "priceChanges": "Prix mis à jour",
    "priceChangeCount_one": "{{count}} changement détecté",
    "priceChangeCount_other": "{{count}} changements détectés",
    "priceChangeConfirm": "Confirmer",
    "priceChangeIgnore": "Ignorer",
    "priceChangeConfirmed": "Prix mis à jour",
    "noPriceChanges": "Aucun changement de prix détecté",
    "checkedCount": "{{count}} annonces vérifiées",
    "priceChangedBadge": "Prix modifié"
```

In the `"adDetail"` section, add:
```json
    "priceUpdate": "Mise à jour",
    "priceChangeCount_one": "{{count}} mise à jour",
    "priceChangeCount_other": "{{count}} mises à jour"
```

- [ ] **Step 2: Add English translations**

In `frontend/src/i18n/locales/en.json`, in the `"crawl"` section, add:

```json
    "checkPrices": "Check prices",
    "checkingPrices": "Checking prices...",
    "priceChanges": "Price updates",
    "priceChangeCount_one": "{{count}} change detected",
    "priceChangeCount_other": "{{count}} changes detected",
    "priceChangeConfirm": "Confirm",
    "priceChangeIgnore": "Dismiss",
    "priceChangeConfirmed": "Price updated",
    "noPriceChanges": "No price changes detected",
    "checkedCount": "{{count}} ads checked",
    "priceChangedBadge": "Price changed"
```

In the `"adDetail"` section, add:
```json
    "priceUpdate": "Price update",
    "priceChangeCount_one": "{{count}} update",
    "priceChangeCount_other": "{{count}} updates"
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/i18n/locales/fr.json frontend/src/i18n/locales/en.json
git commit -m "feat: add i18n translations for price change detection"
```

---

### Task 7: Frontend — "Check Prices" button and results on CrawlPage

**Files:**
- Modify: `frontend/src/pages/CrawlPage.tsx`

- [ ] **Step 1: Add imports and state**

At the top of `CrawlPage.tsx`, add `useCheckPrices` and `useConfirmPrice` to the imports from `../hooks/queries` (line 7):
```typescript
import { useCrawlSearch, useCrawlExtract, useCrawlConfirm, useMergeAd, useAccessoryCatalog, useActiveCrawlSession, useUpdateCrawlAdAction, useCloseCrawlSession, useRemoveCrawlSessionAd, useCheckPrices, useConfirmPrice } from '../hooks/queries'
```

Add `DollarSign` to the lucide-react imports (line 2).

Add `PriceChangeEntry` to the types import (line 9):
```typescript
import type { CrawlAdSummary, CrawlDiff, Accessory, PotentialDuplicate, PriceChangeEntry } from '../types'
```

Inside the `CrawlPage` component, after the existing state declarations (~line 55), add:
```typescript
  const [priceChanges, setPriceChanges] = useState<PriceChangeEntry[]>([])
  const [confirmedPriceIds, setConfirmedPriceIds] = useState<Set<number>>(new Set())
  const [dismissedPriceIds, setDismissedPriceIds] = useState<Set<number>>(new Set())
```

After the existing mutation hooks (~line 76), add:
```typescript
  const checkPricesMut = useCheckPrices()
  const confirmPriceMut = useConfirmPrice()
```

- [ ] **Step 2: Add handleCheckPrices function**

After the `handleSearch` function, add:
```typescript
  function handleCheckPrices() {
    checkPricesMut.mutate(undefined, {
      onSuccess: (data) => {
        setPriceChanges(data.price_changes)
        setConfirmedPriceIds(new Set())
        setDismissedPriceIds(new Set())
        if (data.price_changes.length === 0) {
          toast(t('crawl.noPriceChanges') + ` (${t('crawl.checkedCount', { count: data.checked_count })})`, 'info')
        }
      },
      onError: (err) => {
        toast((err as Error).message, 'error')
      },
    })
  }

  function handleConfirmPrice(adId: number, newPrice: number) {
    confirmPriceMut.mutate({ adId, newPrice }, {
      onSuccess: () => {
        setConfirmedPriceIds(prev => new Set(prev).add(adId))
        toast(t('crawl.priceChangeConfirmed'), 'success')
      },
      onError: (err) => {
        toast((err as Error).message, 'error')
      },
    })
  }

  function handleDismissPrice(adId: number) {
    setDismissedPriceIds(prev => new Set(prev).add(adId))
  }
```

- [ ] **Step 3: Add "Check Prices" button in the idle/search UI**

In the idle/searching section (~line 640), after the search button and its error block, add a second button. Find the closing `</Button>` of the search button (after line 663), and after the error div, add:

```tsx
          <Button
            onClick={handleCheckPrices}
            disabled={checkPricesMut.isPending}
            variant="secondary"
            className="gap-2 mt-3"
          >
            {checkPricesMut.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('crawl.checkingPrices')}
              </>
            ) : (
              <>
                <DollarSign className="h-4 w-4" />
                {t('crawl.checkPrices')}
              </>
            )}
          </Button>
```

- [ ] **Step 4: Add price changes results section**

After the idle/search section closing `</div>` and before the done section, add the price changes display. Place this after the `)}` that closes the idle section (around line 670):

```tsx
      {/* Price changes results */}
      {priceChanges.length > 0 && status === 'idle' && (
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-[11px] text-text-muted uppercase tracking-widest font-semibold flex items-center gap-2">
              <DollarSign className="h-3.5 w-3.5" />
              {t('crawl.priceChanges')}
            </h3>
            <Badge className="bg-amber-500/15 text-amber-300 text-[10px]">
              {t('crawl.priceChangeCount', { count: priceChanges.filter(pc => !confirmedPriceIds.has(pc.id) && !dismissedPriceIds.has(pc.id)).length })}
            </Badge>
          </div>
          <div className="space-y-2">
            {priceChanges.map((pc) => {
              const isConfirmed = confirmedPriceIds.has(pc.id)
              const isDismissed = dismissedPriceIds.has(pc.id)
              if (isDismissed) return null

              return (
                <div
                  key={pc.id}
                  className={`rounded-xl border p-4 transition-all ${
                    isConfirmed
                      ? 'bg-green-500/5 border-green-500/20 opacity-60'
                      : 'bg-card border-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Link to={`/ads/${pc.id}`} className="text-sm font-medium text-text-primary hover:text-amber-400 transition-colors truncate">
                          {pc.subject || `#${pc.id}`}
                        </Link>
                        {pc.city && (
                          <span className="text-[10px] text-text-dim shrink-0">{pc.city}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-text-muted tabular-nums">{formatPrice(pc.current_price)}</span>
                        <ArrowRight className="h-3 w-3 text-text-dim" />
                        <span className="text-sm font-semibold tabular-nums text-text-primary">{formatPrice(pc.new_price)}</span>
                        <span className={`text-xs font-semibold tabular-nums ${pc.price_delta < 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pc.price_delta < 0 ? '' : '+'}{pc.price_delta}€
                        </span>
                      </div>
                    </div>
                    {!isConfirmed && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleDismissPrice(pc.id)}
                          className="gap-1"
                        >
                          <X className="h-3.5 w-3.5" />
                          {t('crawl.priceChangeIgnore')}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleConfirmPrice(pc.id, pc.new_price)}
                          disabled={confirmPriceMut.isPending}
                          className="gap-1"
                        >
                          <Check className="h-3.5 w-3.5" />
                          {t('crawl.priceChangeConfirm')}
                        </Button>
                      </div>
                    )}
                    {isConfirmed && (
                      <Badge className="bg-green-500/15 text-green-300 text-[10px]">
                        <Check className="h-3 w-3 mr-1" />
                        {t('crawl.priceChangeConfirmed')}
                      </Badge>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
```

- [ ] **Step 5: Add price change badge in crawl search results**

In the crawl search results list (the grid that shows search results), find where `exists_in_db` badge is rendered (search for `crawl.inDb` or `crawl.existsInDb`). After the "En base" badge, add a price change badge:

```tsx
{ad.summary.price_changed && (
  <Badge className="bg-amber-500/15 text-amber-300 text-[10px]">
    {t('crawl.priceChangedBadge')} ({ad.summary.price_delta! < 0 ? '' : '+'}{ad.summary.price_delta}€)
  </Badge>
)}
```

- [ ] **Step 6: Verify build**

Run: `cd /Users/corentinhermet/Work/himalayan-450-analyzer/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/CrawlPage.tsx
git commit -m "feat: add check prices button and price change cards on CrawlPage"
```

---

### Task 8: Frontend — Price update source in AdDetailPage timeline

**Files:**
- Modify: `frontend/src/pages/AdDetailPage.tsx:466-488`

- [ ] **Step 1: Update dot color for price_update entries**

In `AdDetailPage.tsx`, find the dot color logic (line 467):
```typescript
isLatest ? 'bg-amber-400' : entry.source === 'repost' ? 'bg-purple-400' : 'bg-white/30'
```

Replace with:
```typescript
isLatest ? 'bg-amber-400' : entry.source === 'repost' ? 'bg-purple-400' : entry.source === 'price_update' ? 'bg-emerald-400' : 'bg-white/30'
```

- [ ] **Step 2: Update badge rendering for price_update**

Find the badge source rendering (lines 481-488):
```typescript
<Badge className={`text-[10px] ${
  entry.source === 'initial' ? 'bg-white/[0.06] text-text-dim' :
  entry.source === 'repost' ? 'bg-purple-500/15 text-purple-300' :
  'bg-amber-500/15 text-amber-300'
}`}>
  {entry.source === 'initial' ? t('adDetail.initialPublication') :
   entry.source === 'repost' ? t('adDetail.repost') : t('adDetail.manualEntry')}
</Badge>
```

Replace with:
```typescript
<Badge className={`text-[10px] ${
  entry.source === 'initial' ? 'bg-white/[0.06] text-text-dim' :
  entry.source === 'repost' ? 'bg-purple-500/15 text-purple-300' :
  entry.source === 'price_update' ? 'bg-emerald-500/15 text-emerald-300' :
  'bg-amber-500/15 text-amber-300'
}`}>
  {entry.source === 'initial' ? t('adDetail.initialPublication') :
   entry.source === 'repost' ? t('adDetail.repost') :
   entry.source === 'price_update' ? t('adDetail.priceUpdate') :
   t('adDetail.manualEntry')}
</Badge>
```

- [ ] **Step 3: Update summary footer to count price updates alongside reposts**

Find the summary line (line 517):
```typescript
<span className="text-text-dim text-xs">{t('adDetail.repostCount', { count: priceHistory.history.filter(h => h.source === 'repost').length })}</span>
```

Replace with:
```typescript
<span className="text-text-dim text-xs">
  {t('adDetail.repostCount', { count: priceHistory.history.filter(h => h.source === 'repost').length })}
  {priceHistory.history.filter(h => h.source === 'price_update').length > 0 && (
    <> · {t('adDetail.priceChangeCount', { count: priceHistory.history.filter(h => h.source === 'price_update').length })}</>
  )}
</span>
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/corentinhermet/Work/himalayan-450-analyzer/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/AdDetailPage.tsx
git commit -m "feat: render price_update entries in AdDetailPage price timeline"
```

---

### Task 9: Visual verification and final commit

- [ ] **Step 1: Start the dev environment**

Run: `cd /Users/corentinhermet/Work/himalayan-450-analyzer && source .venv/bin/activate && make dev`

- [ ] **Step 2: Verify in browser**

1. Open the Crawl page — confirm the "Check prices" button appears next to the search button
2. Click "Check prices" — confirm it fetches and either shows results or "no changes" toast
3. If price changes exist, confirm the cards show old price -> new price with delta
4. Confirm and dismiss buttons work correctly
5. Launch a crawl — confirm ads with `exists_in_db` show price change badge when applicable
6. Open an ad detail page that has price history — confirm `price_update` entries render with green badge

- [ ] **Step 3: Final commit if any fixups needed**

```bash
git add -A
git commit -m "fix: address visual issues from price change testing"
```
