# New Listing Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect and flag ads that are new motorcycles sold by dealers (not second-hand), with a toggle to hide them in the crawl results list.

**Architecture:** Detection function in `src/extractor.py` combines `seller_type == "pro"` (necessary) + confirming signals (price near catalog, km ~0, text patterns). Flag stored on `CrawlSessionAd` model. Set at search time (lightweight heuristic on subject + price + seller_type from attributes) and refined at extract time (full body + km analysis). Frontend toggle in CrawlPage filters flagged ads client-side.

**Tech Stack:** Python/FastAPI backend, SQLModel/Alembic, React/TypeScript frontend, react-i18next

---

### Task 1: Add `is_new_listing` field to CrawlSessionAd model + migration

**Files:**
- Modify: `src/models.py:129-148`
- Create: `alembic/versions/xxxx_add_is_new_listing.py` (auto-generated)

- [ ] **Step 1: Add field to CrawlSessionAd model**

In `src/models.py`, add `is_new_listing` field to `CrawlSessionAd` class (after `position` field, line 146):

```python
is_new_listing: int = Field(default=0)
```

Use `int` (0/1) to match the existing convention (`exists_in_db`, `sold` fields).

- [ ] **Step 2: Generate Alembic migration**

```bash
cd /Users/corentinhermet/Work/himalayan-450-analyzer
source .venv/bin/activate
alembic revision --autogenerate -m "add is_new_listing to crawl_session_ads"
```

Expected: New migration file created in `alembic/versions/`.

- [ ] **Step 3: Apply migration**

```bash
alembic upgrade head
```

Expected: Migration applied successfully.

- [ ] **Step 4: Commit**

```bash
git add src/models.py alembic/versions/*_add_is_new_listing*.py
git commit -m "feat: add is_new_listing field to CrawlSessionAd model"
```

---

### Task 2: Implement `detect_new_listing()` function

**Files:**
- Modify: `src/extractor.py`

The detection function goes in `extractor.py` because it depends on `NEW_PRICES` already defined there.

- [ ] **Step 1: Add the detection patterns and function**

Add after the `_estimate_new_price` function (after line 176) in `src/extractor.py`:

```python
# ─── Detection annonce neuve concessionnaire ────────────────────────────────

# Patterns indiquant une annonce de moto neuve par concessionnaire
NEW_LISTING_PATTERNS = [
    r"concessionnaire",
    r"frais\s+de\s+mise\s+[aà]\s+la\s+route",
    r"frais\s+d['\u2019]immatriculation",
    r"hors\s+frais",
    r"remise\s+promo",
    r"disponible\s+[aà]\s+l['\u2019]essai",
    r"garantie\s+\d+\s+ans?\s+pi[eè]ces",
    r"garantie\s+constructeur",
    r"refroidissement\s+liquide\s+40\s*cv",
    r"moteur\s+sherpa\s+450",
    r"monocylindre\s+452",
    r"40\s*cv.*8000\s*tr",
    r"ttc\b",
]


def detect_new_listing(
    seller_type: str | None = None,
    price: float | None = None,
    mileage_km: int | None = None,
    subject: str | None = None,
    body: str | None = None,
    variant: str | None = None,
    color: str | None = None,
    wheel_type: str | None = None,
) -> bool:
    """
    Detecte si une annonce est une moto neuve vendue par concessionnaire.

    Condition necessaire : seller_type == "pro".
    Puis au moins un signal confirmant :
      - Prix dans +-5% du catalogue NEW_PRICES
      - Km nul ou quasi-nul (< 100)
      - Patterns texte dans le body ou le subject
    """
    # Condition necessaire : vendeur pro
    if not seller_type or seller_type.lower() not in ("pro", "professional"):
        return False

    # Signal 1 : prix proche du neuf
    if price is not None:
        estimated_new = _estimate_new_price(variant, color, wheel_type)
        if estimated_new is not None and abs(price - estimated_new) / estimated_new <= 0.05:
            return True
        # Fallback : comparer avec tous les prix du catalogue
        all_prices = [v["price"] for v in NEW_PRICES.values()]
        if any(abs(price - p) / p <= 0.05 for p in all_prices):
            return True

    # Signal 2 : km nul ou quasi-nul
    if mileage_km is not None and mileage_km < 100:
        return True

    # Signal 3 : patterns texte
    text = f"{subject or ''} {body or ''}".lower()
    for pattern in NEW_LISTING_PATTERNS:
        if re.search(pattern, text):
            return True

    return False


def detect_new_listing_light(
    subject: str | None = None,
    price: float | None = None,
    seller_type: str | None = None,
) -> bool:
    """
    Version legere pour les resultats de recherche (pas de body/km).

    Condition necessaire : seller_type == "pro".
    Puis au moins un signal : prix proche du neuf OU patterns dans le subject.
    """
    if not seller_type or seller_type.lower() not in ("pro", "professional"):
        return False

    # Signal 1 : prix proche du neuf
    if price is not None:
        all_prices = [v["price"] for v in NEW_PRICES.values()]
        if any(abs(price - p) / p <= 0.05 for p in all_prices):
            return True

    # Signal 2 : patterns dans le subject uniquement
    text = (subject or "").lower()
    for pattern in NEW_LISTING_PATTERNS:
        if re.search(pattern, text):
            return True

    return False
```

- [ ] **Step 2: Verify the module still imports correctly**

```bash
source .venv/bin/activate
python -c "from src.extractor import detect_new_listing, detect_new_listing_light; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/extractor.py
git commit -m "feat: add detect_new_listing() and detect_new_listing_light() functions"
```

---

### Task 3: Extract `seller_type` from search results + call detection at search time

**Files:**
- Modify: `src/crawler.py:27-58`
- Modify: `src/api.py:553-643`

- [ ] **Step 1: Extract `owner_type` from search results in crawler.py**

In `src/crawler.py`, in the `_parse_search_ads` function, add `seller_type` extraction. The LBC `Ad` object from search results has `attributes`, so we can use `_get_attr` pattern. Add after the location extraction block (after line 48), and include it in the returned dict:

```python
# In _parse_search_ads, add seller_type extraction:
# After the location block and before ads.append:

        # Seller type (owner_type attribute)
        seller_type = None
        if hasattr(ad, "attributes") and ad.attributes:
            for attr in ad.attributes:
                if hasattr(attr, "key") and attr.key == "owner_type":
                    seller_type = getattr(attr, "value", None) or getattr(attr, "value_label", None)
                    break

# Then add "seller_type": seller_type to the dict in ads.append
```

The full `ads.append` becomes:

```python
        ads.append({
            "id": ad.id,
            "url": getattr(ad, "url", f"https://www.leboncoin.fr/ad/motos/{ad.id}"),
            "subject": getattr(ad, "subject", None),
            "price": getattr(ad, "price", None),
            "city": city,
            "department": department,
            "thumbnail": thumbnail,
            "seller_type": seller_type,
        })
```

- [ ] **Step 2: Call `detect_new_listing_light` during crawl search in api.py**

In `src/api.py`, in the `crawl_search` endpoint (line 632-640), import and call `detect_new_listing_light` when creating `CrawlSessionAd` entries. The detection result sets `is_new_listing` on the CrawlSessionAd.

Add the import at the top of the function or at the file level:
```python
from .extractor import detect_new_listing_light
```

Then modify the CrawlSessionAd creation loop (lines 632-640):

```python
    for i, ad in enumerate(results["ads"]):
        is_new = detect_new_listing_light(
            subject=ad.get("subject"),
            price=ad.get("price"),
            seller_type=ad.get("seller_type"),
        )
        session.add(CrawlSessionAd(
            session_id=crawl_session.id, ad_id=ad["id"], url=ad["url"],
            subject=ad.get("subject"), price=ad.get("price"),
            city=ad.get("city"), department=ad.get("department"),
            thumbnail=ad.get("thumbnail"),
            exists_in_db=1 if ad.get("exists_in_db") else 0,
            position=i,
            is_new_listing=1 if is_new else 0,
        ))
```

Also include `is_new_listing` in the search response (the `ad` dicts sent to frontend). Add to each ad in the results loop (after line 586):

```python
        ad["is_new_listing"] = is_new  # Will be set per ad in the loop above
```

Actually, since the detection happens when creating CrawlSessionAd, we need to also add it to the results dict sent to frontend. Simplest: compute it inline for each ad and include in both the CrawlSessionAd and the response.

- [ ] **Step 3: Verify the server starts**

```bash
source .venv/bin/activate
python -c "from src.api import app; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/crawler.py src/api.py
git commit -m "feat: extract seller_type from search results, flag new listings at search time"
```

---

### Task 4: Refine detection at extract time + include in active session response

**Files:**
- Modify: `src/api.py:888-951` (crawl_extract endpoint)
- Modify: `src/api.py:646-685` (get_active_crawl_session endpoint)

- [ ] **Step 1: Call full `detect_new_listing` in crawl_extract endpoint**

In `src/api.py`, in the `crawl_extract` endpoint (around line 888), after extraction succeeds, call `detect_new_listing` and update the `CrawlSessionAd.is_new_listing` field.

Add import:
```python
from .extractor import detect_new_listing
```

After `ad_data` is obtained (around line 899) and before the existing ad comparison, add:

```python
    # Mettre a jour le flag is_new_listing avec la detection complete
    is_new = detect_new_listing(
        seller_type=ad_data.get("seller_type"),
        price=ad_data.get("price"),
        mileage_km=ad_data.get("mileage_km"),
        subject=ad_data.get("subject"),
        body=ad_data.get("body"),
        variant=ad_data.get("variant"),
        color=ad_data.get("color"),
        wheel_type=ad_data.get("wheel_type"),
    )

    # Mettre a jour le CrawlSessionAd
    crawl_ad = session.exec(
        select(CrawlSessionAd)
        .where(CrawlSessionAd.session_id == req.session_id, CrawlSessionAd.ad_id == req.ad_id)
    ).first()
    if crawl_ad:
        crawl_ad.is_new_listing = 1 if is_new else 0
        session.add(crawl_ad)
```

**Note:** The `ExtractRequest` model needs `session_id`. Check if it already has it — if not, we can look up the active session. Looking at the code, the extract endpoint takes `req: ExtractRequest` which has `ad_id` and `url`. We need to find the active session's CrawlSessionAd. Use the active session:

```python
    active_session = session.exec(
        select(CrawlSession).where(CrawlSession.status == "active")
        .order_by(CrawlSession.created_at.desc())
    ).first()
    if active_session:
        crawl_ad = session.exec(
            select(CrawlSessionAd)
            .where(CrawlSessionAd.session_id == active_session.id, CrawlSessionAd.ad_id == req.ad_id)
        ).first()
        if crawl_ad:
            crawl_ad.is_new_listing = 1 if is_new else 0
            session.add(crawl_ad)
```

Also include `is_new_listing` in the response:

```python
    return {
        "ad_data": ad_data,
        "exists_in_db": existing is not None,
        "existing": existing_data,
        "diffs": diffs,
        "potential_duplicates": potential_duplicates,
        "is_new_listing": is_new,
    }
```

- [ ] **Step 2: Include `is_new_listing` in active session response**

In `src/api.py`, in the `get_active_crawl_session` endpoint (line 666-677), add `is_new_listing` to the ad dict:

```python
    for row in rows:
        ads.append({
            "id": row.ad_id,
            "url": row.url,
            "subject": row.subject,
            "price": row.price,
            "city": row.city,
            "department": row.department,
            "thumbnail": row.thumbnail,
            "exists_in_db": row.ad_id in existing_ids,
            "action": row.action,
            "is_new_listing": bool(row.is_new_listing),
        })
```

- [ ] **Step 3: Commit**

```bash
git add src/api.py
git commit -m "feat: refine new listing detection at extract time, include in API responses"
```

---

### Task 5: Frontend types + CrawlAdSummary update

**Files:**
- Modify: `frontend/src/types.ts:139-149`

- [ ] **Step 1: Add `is_new_listing` to CrawlAdSummary**

In `frontend/src/types.ts`, add `is_new_listing` to the `CrawlAdSummary` interface (after `possible_repost_of` field, line 148):

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
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/corentinhermet/Work/himalayan-450-analyzer
git add frontend/src/types.ts
git commit -m "feat: add is_new_listing to CrawlAdSummary type"
```

---

### Task 6: Frontend translations

**Files:**
- Modify: `frontend/src/i18n/locales/fr.json`
- Modify: `frontend/src/i18n/locales/en.json`

- [ ] **Step 1: Add French translations**

In `frontend/src/i18n/locales/fr.json`, add to the `crawl` section (after `"adSkippedToast"` line 247):

```json
    "newListingBadge": "Neuf",
    "hideNewListings": "Cacher les neuves",
    "newListingCount_one": "{{count}} neuve",
    "newListingCount_other": "{{count}} neuves"
```

- [ ] **Step 2: Add English translations**

In `frontend/src/i18n/locales/en.json`, add to the `crawl` section (after `"adSkippedToast"` line 247):

```json
    "newListingBadge": "New",
    "hideNewListings": "Hide new bikes",
    "newListingCount_one": "{{count}} new bike",
    "newListingCount_other": "{{count}} new bikes"
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/i18n/locales/fr.json frontend/src/i18n/locales/en.json
git commit -m "feat: add translations for new listing detection"
```

---

### Task 7: Frontend CrawlPage — badge + toggle

**Files:**
- Modify: `frontend/src/pages/CrawlPage.tsx`

- [ ] **Step 1: Add state and computed values for new listing toggle**

In `CrawlPage.tsx`, add a `hideNewListings` state. Add after `showInDb` state declaration (line 53):

```typescript
const [hideNewListings, setHideNewListings] = useState(false)
```

Add a computed count after `inDbCount` (line 528):

```typescript
const newListingCount = adStates.filter((s) => s.summary.is_new_listing && s.action === 'pending').length
```

- [ ] **Step 2: Update `visibleAdStates` to filter new listings**

Modify the `visibleAdStates` computation (line 531) to also filter out new listings when the toggle is on:

```typescript
const visibleAdStates = adStates.filter((s) => {
  if (!showInDb && s.summary.exists_in_db && s.action === 'pending') return false
  if (hideNewListings && s.summary.is_new_listing && s.action === 'pending') return false
  return true
})
```

- [ ] **Step 3: Update AdState restore from active session to include is_new_listing**

In the session restore `useEffect` (around line 87-98), include `is_new_listing` in the summary mapping:

```typescript
const states: AdState[] = activeSession.ads.map((ad) => ({
  summary: {
    id: ad.id,
    url: ad.url,
    subject: ad.subject,
    price: ad.price,
    city: ad.city,
    department: ad.department,
    thumbnail: ad.thumbnail,
    exists_in_db: ad.exists_in_db,
    possible_repost_of: null,
    is_new_listing: ad.is_new_listing,
  },
  action: ad.action as AdAction,
}))
```

- [ ] **Step 4: Also pass is_new_listing from search results**

In `handleSearch` `onSuccess` callback (around line 137), the `data.ads` already contain the summary with `is_new_listing` from the backend (it's in the CrawlAdSummary). The mapping `summary: ad` passes it through. No change needed here since the search response includes `is_new_listing` in each ad dict.

But need to ensure the search response includes it. In `src/api.py` `crawl_search`, the response returns `{**results, "session_id": ...}` which includes the original `results["ads"]` dicts. We need to add `is_new_listing` to each ad dict in the response. Add this in the loop where we compute `is_new`:

```python
        ad["is_new_listing"] = is_new
```

This was partially covered in Task 3. Make sure it's there.

- [ ] **Step 5: Update extract result handling to update is_new_listing**

In the `processNext` callback, when extraction succeeds (around line 192-203), the extract response includes `is_new_listing`. Update the AdState's summary:

```typescript
onSuccess: (result) => {
  const newStates = [...updated]
  newStates[nextIdx] = {
    ...newStates[nextIdx],
    summary: {
      ...newStates[nextIdx].summary,
      is_new_listing: result.is_new_listing,
    },
    action: 'waiting',
    extractData: result.ad_data,
    existingData: result.existing,
    diffs: result.diffs,
    existsInDb: result.exists_in_db,
    potentialDuplicates: result.potential_duplicates,
  }
  setAdStates(newStates)
  setStatus('waiting_validation')
},
```

- [ ] **Step 6: Add badge on ad cards in the results grid**

In the ad card rendering (around line 1365-1376, where other badges like "En base" and "Repost?" are rendered), add a "Neuf" badge for new listings. Add after the repost badge block (after line 1376):

```tsx
{state.summary.is_new_listing && isPending && (
  <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-blue-500/20 backdrop-blur-sm border border-blue-500/30">
    <span className="text-[10px] font-semibold text-blue-300 uppercase tracking-wide">{t('crawl.newListingBadge')}</span>
  </div>
)}
```

**Note:** If the ad already has an "En base" or "Repost?" badge (same `top-2 left-2` position), the new listing badge should not overlap. Check the conditions:
- `inDb && isPending` shows "En base" badge
- `!inDb && isPending && state.summary.possible_repost_of` shows "Repost?" badge
- New listing badge: `is_new_listing && isPending`

A new listing from a dealer is unlikely to be `inDb` or a repost, but to be safe, only show the new listing badge when the other badges don't show. Adjust condition:

```tsx
{state.summary.is_new_listing && isPending && !inDb && !state.summary.possible_repost_of && (
  <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-blue-500/20 backdrop-blur-sm border border-blue-500/30">
    <span className="text-[10px] font-semibold text-blue-300 uppercase tracking-wide">{t('crawl.newListingBadge')}</span>
  </div>
)}
```

- [ ] **Step 7: Add toggle in the results grid header**

In the results grid header section (around lines 1278-1290, where the "Afficher celles en base" toggle is), add a second toggle for hiding new listings. Place it next to the existing toggle. Wrap both toggles in a flex container:

```tsx
<div className="flex items-center gap-4">
  {newListingCount > 0 && (
    <button
      onClick={() => setHideNewListings(!hideNewListings)}
      className="flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary transition-colors"
    >
      <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${hideNewListings ? 'bg-blue-500/40' : 'bg-white/[0.08]'}`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 mt-0.5 ${hideNewListings ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </span>
      <span className={hideNewListings ? 'text-blue-300' : ''}>
        {t('crawl.hideNewListings')} ({newListingCount})
      </span>
    </button>
  )}
  {inDbCount > 0 && (
    <button
      onClick={() => setShowInDb(!showInDb)}
      className="flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary transition-colors"
    >
      <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${showInDb ? 'bg-amber-500/40' : 'bg-white/[0.08]'}`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 mt-0.5 ${showInDb ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </span>
      <span className={showInDb ? 'text-amber-300' : ''}>
        {t('crawl.showInDb')} ({inDbCount})
      </span>
    </button>
  )}
</div>
```

- [ ] **Step 8: Also display new listing count in the search results header**

In the header text (around line 1267-1272), add the new listing count after the "already in DB" count:

```tsx
{newListingCount > 0 && (
  <span className="ml-1 text-blue-300 font-normal">
    · {t('crawl.newListingCount', { count: newListingCount })}
  </span>
)}
```

- [ ] **Step 9: Verify frontend builds**

```bash
cd /Users/corentinhermet/Work/himalayan-450-analyzer/frontend
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 10: Commit**

```bash
cd /Users/corentinhermet/Work/himalayan-450-analyzer
git add frontend/src/pages/CrawlPage.tsx
git commit -m "feat: add new listing badge and hide toggle in crawl results"
```

---

### Task 8: Also skip new listings in auto-processing crawl loop

**Files:**
- Modify: `frontend/src/pages/CrawlPage.tsx`

- [ ] **Step 1: Skip new listings in processNext when toggle is on**

In the `processNext` callback (around line 153-167), the loop already skips in-DB ads when toggle is off. Add similar logic for new listings. Keep a ref in sync like `showInDbRef`:

Add state ref (near line 61):
```typescript
const hideNewListingsRef = useRef(false)
```

Add sync effect (near line 77):
```typescript
useEffect(() => { hideNewListingsRef.current = hideNewListings }, [hideNewListings])
```

In the `processNext` loop (around line 162-163), add:

```typescript
if (hideNewListingsRef.current && states[i].summary.is_new_listing) continue
```

This way, auto-processing also skips new listings when the toggle is on.

- [ ] **Step 2: Commit**

```bash
cd /Users/corentinhermet/Work/himalayan-450-analyzer
git add frontend/src/pages/CrawlPage.tsx
git commit -m "feat: skip new listings in auto-processing when toggle is on"
```

---

### Task 9: Update lbc_client.py search to pass through seller_type

**Files:**
- Modify: `src/lbc_client.py`

- [ ] **Step 1: Check if lbc_client.search() passes through seller_type**

The `lbc_client.search()` calls the LBC service's `/search` endpoint which returns results from `search_all_ads()`. Since we modified `crawler.py` to include `seller_type` in search results, the LBC service already returns it. But `lbc_client.search()` may need to pass the data through.

Read `src/lbc_client.py` to check. If it returns the raw response from the LBC service, no change needed. If it transforms the data, add `seller_type`.

- [ ] **Step 2: Commit if changes were needed**

```bash
git add src/lbc_client.py
git commit -m "feat: pass seller_type through lbc_client search results"
```

---

### Task 10: Final verification

- [ ] **Step 1: Start backend and verify API**

```bash
source .venv/bin/activate
make dev
```

- [ ] **Step 2: Test the full crawl flow**

1. Open the app in browser
2. Go to the Crawl page
3. Start a search
4. Verify new listing badges appear on dealer ads
5. Verify the toggle appears and hides flagged ads
6. Click on a flagged ad to extract — verify the badge updates after extraction

- [ ] **Step 3: Final commit if any fixes needed**
