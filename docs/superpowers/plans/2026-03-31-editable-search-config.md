# Editable Search Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to CRUD search configurations (keyword, cylindree, locations, owner_type, prix, tri, title-only) via the web UI, with a settings page for full management and a summary in the crawl page.

**Architecture:** Extend `BikeSearchConfig` SQLModel with 6 new columns. Add CRUD API endpoints under `/api/bike-models/{slug}/search-configs`. Add a reference data endpoint for lbc enums. Create a new `SettingsPage` component and a compact summary widget in `CrawlPage`. Propagate new fields through `crawler.py`, `lbc_service.py`, and `lbc_client.py`.

**Tech Stack:** Python/FastAPI/SQLModel/Alembic (backend), React 19/TypeScript/TanStack Query/Tailwind v4 (frontend), react-i18next (i18n)

**Note:** No test suite exists in this project. Steps that would normally be TDD are implementation-only.

---

### Task 1: Extend BikeSearchConfig model + Alembic migration

**Files:**
- Modify: `src/models.py:165-177`
- Create: `alembic/versions/xxxx_add_search_config_fields.py` (via autogenerate)

- [ ] **Step 1: Add new fields to BikeSearchConfig**

In `src/models.py`, replace the `BikeSearchConfig` class (lines 165-177) with:

```python
class BikeSearchConfig(SQLModel, table=True):
    __tablename__ = "bike_search_configs"

    id: int | None = Field(default=None, primary_key=True)
    bike_model_id: int = Field(
        sa_column=Column(Integer, ForeignKey("bike_models.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    keyword: str
    min_cc: int | None = None
    max_cc: int | None = None
    locations: list[str] | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    owner_type: str | None = None
    price_min: int | None = None
    price_max: int | None = None
    sort: str | None = None
    search_in_title_only: bool = Field(default=False)

    bike_model: BikeModel | None = Relationship(back_populates="search_configs")
```

Add `JSON` to the SQLAlchemy imports at the top of the file (find the existing `from sqlalchemy import Column, Integer, ...` line and add `JSON`).

- [ ] **Step 2: Generate Alembic migration**

```bash
alembic revision --autogenerate -m "add search config extended fields"
```

Verify the generated migration adds 6 columns: `locations` (JSON), `owner_type` (VARCHAR), `price_min` (INTEGER), `price_max` (INTEGER), `sort` (VARCHAR), `search_in_title_only` (BOOLEAN). All nullable except `search_in_title_only` which defaults to `False`.

- [ ] **Step 3: Apply migration**

```bash
alembic upgrade head
```

- [ ] **Step 4: Commit**

```bash
git add src/models.py alembic/versions/
git commit -m "feat: extend BikeSearchConfig with locations, owner_type, price, sort, title-only fields"
```

---

### Task 2: Add CRUD functions to database.py

**Files:**
- Modify: `src/database.py:660-664`

- [ ] **Step 1: Add CRUD functions after existing `get_search_configs`**

After the existing `get_search_configs` function (line 664), add:

```python
def create_search_config(session: Session, bike_model_id: int, data: dict) -> BikeSearchConfig:
    """Cree une config de recherche."""
    cfg = BikeSearchConfig(bike_model_id=bike_model_id, **data)
    session.add(cfg)
    session.commit()
    session.refresh(cfg)
    return cfg


def update_search_config(session: Session, config_id: int, data: dict) -> BikeSearchConfig:
    """Met a jour une config de recherche."""
    cfg = session.get(BikeSearchConfig, config_id)
    if not cfg:
        raise ValueError(f"SearchConfig {config_id} introuvable")
    for key, value in data.items():
        setattr(cfg, key, value)
    session.commit()
    session.refresh(cfg)
    return cfg


def delete_search_config(session: Session, config_id: int) -> None:
    """Supprime une config de recherche."""
    cfg = session.get(BikeSearchConfig, config_id)
    if not cfg:
        raise ValueError(f"SearchConfig {config_id} introuvable")
    session.delete(cfg)
    session.commit()
```

Make sure `BikeSearchConfig` is already imported at the top of `database.py` (check the existing imports from `.models`).

- [ ] **Step 2: Commit**

```bash
git add src/database.py
git commit -m "feat: add CRUD functions for search config"
```

---

### Task 3: Add API endpoints for search config CRUD + reference data

**Files:**
- Modify: `src/api.py`

- [ ] **Step 1: Add Pydantic schemas**

Near the top of `src/api.py` where other request/response schemas are defined, add:

```python
class SearchConfigCreate(SQLModel):
    keyword: str
    min_cc: int | None = None
    max_cc: int | None = None
    locations: list[str] | None = None
    owner_type: str | None = None
    price_min: int | None = None
    price_max: int | None = None
    sort: str | None = None
    search_in_title_only: bool = False

class SearchConfigUpdate(SQLModel):
    keyword: str | None = None
    min_cc: int | None = None
    max_cc: int | None = None
    locations: list[str] | None = None
    owner_type: str | None = None
    price_min: int | None = None
    price_max: int | None = None
    sort: str | None = None
    search_in_title_only: bool | None = None
```

- [ ] **Step 2: Add CRUD endpoints**

Add these endpoints in `src/api.py` (group them together, e.g., before the crawl endpoints):

```python
@app.get("/api/bike-models/{slug}/search-configs")
def list_search_configs(slug: str, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)
    configs = get_search_configs(session, model.id)
    return [
        {
            "id": c.id,
            "keyword": c.keyword,
            "min_cc": c.min_cc,
            "max_cc": c.max_cc,
            "locations": c.locations,
            "owner_type": c.owner_type,
            "price_min": c.price_min,
            "price_max": c.price_max,
            "sort": c.sort,
            "search_in_title_only": c.search_in_title_only,
        }
        for c in configs
    ]


@app.post("/api/bike-models/{slug}/search-configs", status_code=201)
def create_search_config_endpoint(slug: str, body: SearchConfigCreate, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)
    cfg = create_search_config(session, model.id, body.model_dump(exclude_unset=True))
    return {"id": cfg.id, "status": "created"}


@app.patch("/api/bike-models/{slug}/search-configs/{config_id}")
def update_search_config_endpoint(slug: str, config_id: int, body: SearchConfigUpdate, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)
    # Verify config belongs to this model
    cfg = session.get(BikeSearchConfig, config_id)
    if not cfg or cfg.bike_model_id != model.id:
        raise HTTPException(status_code=404, detail="Config introuvable")
    updated = update_search_config(session, config_id, body.model_dump(exclude_unset=True))
    return {"id": updated.id, "status": "updated"}


@app.delete("/api/bike-models/{slug}/search-configs/{config_id}")
def delete_search_config_endpoint(slug: str, config_id: int, session: Session = Depends(get_session)):
    model = resolve_bike_model(slug, session)
    cfg = session.get(BikeSearchConfig, config_id)
    if not cfg or cfg.bike_model_id != model.id:
        raise HTTPException(status_code=404, detail="Config introuvable")
    delete_search_config(session, config_id)
    return {"deleted": 1}
```

Add imports at the top: `create_search_config`, `update_search_config`, `delete_search_config` from `.database`, and `BikeSearchConfig` from `.models`.

- [ ] **Step 3: Add reference data endpoint for lbc enums**

This endpoint returns the available regions, departments, sort options, and owner types so the frontend can populate dropdowns without hardcoding values:

```python
@app.get("/api/reference/lbc-enums")
def get_lbc_enums():
    """Retourne les valeurs disponibles pour les filtres LeBonCoin."""
    import lbc as lbc_lib

    regions = [
        {"value": r.name, "label": r.name.replace("_", " ").title()}
        for r in lbc_lib.Region
    ]
    departments = [
        {"value": d.name, "label": d.name.replace("_", " ").title(), "code": d.value[2], "region": d.value[1]}
        for d in lbc_lib.Department
    ]
    sorts = [
        {"value": s.name.lower(), "label": s.name.replace("_", " ").title()}
        for s in lbc_lib.Sort
    ]
    owner_types = [
        {"value": o.name.lower(), "label": o.name.replace("_", " ").title()}
        for o in lbc_lib.OwnerType
    ]

    return {
        "regions": regions,
        "departments": departments,
        "sorts": sorts,
        "owner_types": owner_types,
    }
```

- [ ] **Step 4: Commit**

```bash
git add src/api.py
git commit -m "feat: add search config CRUD endpoints and lbc reference data"
```

---

### Task 4: Propagate new fields through crawler, lbc_service, lbc_client

**Files:**
- Modify: `src/crawler.py:72-120`
- Modify: `src/lbc_service.py:24-56`
- Modify: `src/lbc_client.py:22-31`
- Modify: `src/api.py:1448-1465` (crawl search endpoint)

- [ ] **Step 1: Update `crawler.py` — `search_all_ads()`**

Replace the function signature and kwargs building (lines 72-100):

```python
def search_all_ads(
    keyword: str = "Himalayan",
    min_cc: int | None = None,
    max_cc: int | None = None,
    locations: list[str] | None = None,
    owner_type: str | None = None,
    price_min: int | None = None,
    price_max: int | None = None,
    sort: str | None = None,
    search_in_title_only: bool = False,
) -> dict:
    """
    Lance la recherche sur toutes les pages et retourne tous les resultats.

    Args:
        keyword: Mot-cle de recherche.
        min_cc: Cylindree minimum (optionnel).
        max_cc: Cylindree maximum (optionnel).
        locations: Liste de noms de regions/departements lbc (optionnel).
        owner_type: Type de vendeur : "private", "pro", "all" (optionnel).
        price_min: Prix minimum (optionnel).
        price_max: Prix maximum (optionnel).
        sort: Tri : "relevance", "newest", "oldest", "cheapest", "expensive" (optionnel).
        search_in_title_only: Rechercher dans le titre uniquement.

    Returns:
        dict avec total et liste complete d'annonces legeres.
    """
    from .extractor import get_lbc_client
    client = get_lbc_client()

    # Construire les kwargs de recherche
    search_kwargs = {
        "text": keyword,
        "category": SEARCH_CATEGORY,
        "limit": RESULTS_PER_PAGE,
        "page": 1,
        "search_in_title_only": search_in_title_only,
    }

    if min_cc is not None or max_cc is not None:
        cc_min = min_cc or 0
        cc_max = max_cc or 99999
        search_kwargs["cubic_capacity"] = (cc_min, cc_max)

    if locations:
        resolved = _resolve_locations(locations)
        if resolved:
            search_kwargs["locations"] = resolved

    if owner_type:
        owner_map = {"private": lbc.OwnerType.PRIVATE, "pro": lbc.OwnerType.PRO, "all": lbc.OwnerType.ALL}
        if owner_type in owner_map:
            search_kwargs["owner_type"] = owner_map[owner_type]

    if price_min is not None or price_max is not None:
        p_min = price_min or 0
        p_max = price_max or 999999
        search_kwargs["price"] = (p_min, p_max)

    if sort:
        sort_map = {
            "relevance": lbc.Sort.RELEVANCE,
            "newest": lbc.Sort.NEWEST,
            "oldest": lbc.Sort.OLDEST,
            "cheapest": lbc.Sort.CHEAPEST,
            "expensive": lbc.Sort.EXPENSIVE,
        }
        if sort in sort_map:
            search_kwargs["sort"] = sort_map[sort]
```

The rest of the function (pagination loop, lines 102-120) stays unchanged.

- [ ] **Step 2: Add `_resolve_locations` helper in `crawler.py`**

Add this helper above `search_all_ads`:

```python
def _resolve_locations(location_names: list[str]) -> list:
    """Resout les noms de locations en objets lbc.Region/Department."""
    resolved = []
    region_map = {r.name: r for r in lbc.Region}
    dept_map = {d.name: d for d in lbc.Department}
    for name in location_names:
        upper = name.upper()
        if upper in region_map:
            resolved.append(region_map[upper])
        elif upper in dept_map:
            resolved.append(dept_map[upper])
    return resolved
```

- [ ] **Step 3: Update `lbc_service.py` — `SearchRequest` model and `/search` endpoint**

Replace `SearchRequest` (lines 24-27):

```python
class SearchRequest(BaseModel):
    keyword: str = "Himalayan"
    min_cc: int | None = None
    max_cc: int | None = None
    locations: list[str] | None = None
    owner_type: str | None = None
    price_min: int | None = None
    price_max: int | None = None
    sort: str | None = None
    search_in_title_only: bool = False
```

Replace the `/search` endpoint body (lines 48-56):

```python
@app.post("/search")
def search(req: SearchRequest):
    """Lance la recherche LeBonCoin et retourne les resultats bruts."""
    from .crawler import search_all_ads

    try:
        return search_all_ads(
            keyword=req.keyword,
            min_cc=req.min_cc,
            max_cc=req.max_cc,
            locations=req.locations,
            owner_type=req.owner_type,
            price_min=req.price_min,
            price_max=req.price_max,
            sort=req.sort,
            search_in_title_only=req.search_in_title_only,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur recherche LeBonCoin : {e}")
```

- [ ] **Step 4: Update `lbc_client.py` — `search()` function**

Replace the `search` function (lines 22-31):

```python
def search(
    keyword: str = "Himalayan",
    min_cc: int | None = None,
    max_cc: int | None = None,
    locations: list[str] | None = None,
    owner_type: str | None = None,
    price_min: int | None = None,
    price_max: int | None = None,
    sort: str | None = None,
    search_in_title_only: bool = False,
) -> dict:
    """Lance la recherche LeBonCoin via le service local."""
    payload: dict = {"keyword": keyword, "search_in_title_only": search_in_title_only}
    if min_cc is not None:
        payload["min_cc"] = min_cc
    if max_cc is not None:
        payload["max_cc"] = max_cc
    if locations:
        payload["locations"] = locations
    if owner_type:
        payload["owner_type"] = owner_type
    if price_min is not None:
        payload["price_min"] = price_min
    if price_max is not None:
        payload["price_max"] = price_max
    if sort:
        payload["sort"] = sort
    r = httpx.post(f"{_base_url()}/search", json=payload, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()
```

- [ ] **Step 5: Update crawl search endpoint in `api.py` to pass new fields**

In `src/api.py`, update the loop at lines 1448-1454 that iterates over `search_cfgs`:

```python
        for cfg in search_cfgs:
            search_params = dict(
                keyword=cfg.keyword,
                min_cc=cfg.min_cc,
                max_cc=cfg.max_cc,
                locations=cfg.locations,
                owner_type=cfg.owner_type,
                price_min=cfg.price_min,
                price_max=cfg.price_max,
                sort=cfg.sort,
                search_in_title_only=cfg.search_in_title_only,
            )
            if settings.lbc_service_url:
                from . import lbc_client
                r = lbc_client.search(**search_params)
            else:
                from .crawler import search_all_ads
                r = search_all_ads(**search_params)
            all_results_ads.extend(r.get("ads", []))
```

- [ ] **Step 6: Commit**

```bash
git add src/crawler.py src/lbc_service.py src/lbc_client.py src/api.py
git commit -m "feat: propagate extended search config fields through crawler pipeline"
```

---

### Task 5: Frontend — Types, API functions, and hooks

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/hooks/queries.ts`

- [ ] **Step 1: Add SearchConfig type**

At the end of `frontend/src/types.ts` (after line 273), add:

```typescript
// ─── Search Config ────────────────────────────────────────────────────────

export interface SearchConfig {
  id: number
  keyword: string
  min_cc: number | null
  max_cc: number | null
  locations: string[] | null
  owner_type: string | null
  price_min: number | null
  price_max: number | null
  sort: string | null
  search_in_title_only: boolean
}

export interface LbcEnums {
  regions: { value: string; label: string }[]
  departments: { value: string; label: string; code: string; region: string }[]
  sorts: { value: string; label: string }[]
  owner_types: { value: string; label: string }[]
}
```

- [ ] **Step 2: Add API functions**

In `frontend/src/lib/api.ts`, add after the crawl section (after `removeCrawlSessionAd`):

```typescript
// ─── Search Configs ───────────────────────────────────────────────────────

export function fetchSearchConfigs(slug: string): Promise<SearchConfig[]> {
  return fetchJSON<SearchConfig[]>(`/bike-models/${slug}/search-configs`)
}

export function createSearchConfig(slug: string, data: Omit<SearchConfig, 'id'>): Promise<{ id: number; status: string }> {
  return fetchJSON(`/bike-models/${slug}/search-configs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function updateSearchConfig(slug: string, id: number, data: Partial<Omit<SearchConfig, 'id'>>): Promise<{ id: number; status: string }> {
  return fetchJSON(`/bike-models/${slug}/search-configs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function deleteSearchConfig(slug: string, id: number): Promise<{ deleted: number }> {
  return fetchJSON(`/bike-models/${slug}/search-configs/${id}`, { method: 'DELETE' })
}

export function fetchLbcEnums(): Promise<LbcEnums> {
  return fetchJSON<LbcEnums>('/reference/lbc-enums')
}
```

Add `SearchConfig` and `LbcEnums` to the imports from `../types` at the top of the file.

- [ ] **Step 3: Add hooks**

In `frontend/src/hooks/queries.ts`, add after the crawl hooks section:

```typescript
// ─── Search Configs ───────────────────────────────────────────────────────

export function useSearchConfigs(slug: string) {
  return useQuery({
    queryKey: ['search-configs', slug],
    queryFn: () => api.fetchSearchConfigs(slug),
    staleTime: 30_000,
  })
}

export function useCreateSearchConfig(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<SearchConfig, 'id'>) => api.createSearchConfig(slug, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['search-configs', slug] })
    },
  })
}

export function useUpdateSearchConfig(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Omit<SearchConfig, 'id'>> }) =>
      api.updateSearchConfig(slug, id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['search-configs', slug] })
    },
  })
}

export function useDeleteSearchConfig(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteSearchConfig(slug, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['search-configs', slug] })
    },
  })
}

export function useLbcEnums() {
  return useQuery({
    queryKey: ['lbc-enums'],
    queryFn: api.fetchLbcEnums,
    staleTime: Infinity,
  })
}
```

Add `SearchConfig` to the imports from `../types`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/lib/api.ts frontend/src/hooks/queries.ts
git commit -m "feat: add search config types, API functions, and React Query hooks"
```

---

### Task 6: Frontend — Settings page

**Files:**
- Create: `frontend/src/pages/SettingsPage.tsx`
- Modify: `frontend/src/App.tsx:46-56`
- Modify: `frontend/src/components/Sidebar.tsx:196-202`

- [ ] **Step 1: Create SettingsPage component**

Create `frontend/src/pages/SettingsPage.tsx`. This is a larger component — it contains the search config card list with inline editing, add form, and delete. Follow the patterns from `CatalogPage.tsx` for CRUD UI style.

The page should:
- Use `useSearchConfigs(slug)` to load configs
- Use `useLbcEnums()` to load dropdown options
- Display each config as an editable card with fields: keyword (text input), min_cc/max_cc (number inputs), locations (multi-select dropdown grouped by region), owner_type (select: private/pro/all), price_min/price_max (number inputs), sort (select), search_in_title_only (toggle)
- Each card has Edit/Delete buttons; Edit enters inline-edit mode with Save/Cancel
- "Add configuration" button at the bottom opens a blank form
- Use `useCreateSearchConfig`, `useUpdateSearchConfig`, `useDeleteSearchConfig` mutations
- All text via `t()` calls

Key structure:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchConfigs, useCreateSearchConfig, useUpdateSearchConfig, useDeleteSearchConfig, useLbcEnums } from '../hooks/queries'
import { useModelContext } from '../components/ModelLayout'
import type { SearchConfig } from '../types'
// ... lucide icons: Plus, Pencil, Trash2, Save, X, Settings

export default function SettingsPage() {
  const { t } = useTranslation()
  const { slug } = useModelContext()
  const { data: configs, isLoading } = useSearchConfigs(slug)
  const { data: enums } = useLbcEnums()
  const createMut = useCreateSearchConfig(slug)
  const updateMut = useUpdateSearchConfig(slug)
  const deleteMut = useDeleteSearchConfig(slug)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  // ... form state

  // Render: page title, config cards, add button
}
```

For each config card, show a compact summary when not editing:
- **Keyword** prominently
- Badges for active filters (e.g., "411-452cc", "Ile-de-France", "Particuliers", "1000-5000EUR", "Plus recent")
- Edit/Delete icon buttons

When editing, show the full form with all fields.

For the locations multi-select, group departments under their region. Use a simple multi-select with checkboxes (no need for a complex combobox — a scrollable dropdown with region headers is enough).

- [ ] **Step 2: Add route in App.tsx**

In `frontend/src/App.tsx`, add the settings route inside the `<Route path="/models/:slug" element={<ModelLayout />}>` block, after the catalog route (line 55):

```tsx
<Route path="settings" element={<SettingsPage />} />
```

Add the import at the top:

```tsx
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
```

(Follow the existing lazy import pattern if other pages use it, otherwise use a direct import like the other pages.)

- [ ] **Step 3: Add navigation link in Sidebar**

In `frontend/src/components/Sidebar.tsx`, add to the `secondaryNav` array (around line 200), after the catalog entry:

```typescript
{ to: ctx.modelUrl('/settings'), icon: Settings, labelKey: 'nav.settings' },
```

Import `Settings` from `lucide-react` (add to the existing lucide import line).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/SettingsPage.tsx frontend/src/App.tsx frontend/src/components/Sidebar.tsx
git commit -m "feat: add settings page with search config CRUD"
```

---

### Task 7: Frontend — Crawl page search config summary

**Files:**
- Modify: `frontend/src/pages/CrawlPage.tsx:768-817`

- [ ] **Step 1: Add summary widget in the crawl search section**

In `CrawlPage.tsx`, inside the idle/searching section (lines 769-817), add a summary between the description paragraph and the search button. The summary should:
- Use `useSearchConfigs(slug)` to load configs
- Show a compact representation: "N recherches configurees" with keyword badges
- Show key filter badges (cc range, location count, owner type)
- Link to settings page: "Modifier" button/link
- If no configs: show a warning with link to settings

Insert this block between the `<p>` (line 777-779) and the `<Button onClick={handleSearch}>` (line 780):

```tsx
{/* Search config summary */}
<div className="mb-6 w-full max-w-lg">
  {configsLoading ? (
    <div className="h-8 animate-pulse bg-tint/5 rounded-lg" />
  ) : configs && configs.length > 0 ? (
    <div className="rounded-xl border border-tint/[0.08] bg-tint/[0.03] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-muted font-medium uppercase tracking-wider">
          {t('crawl.searchConfigs', { count: configs.length })}
        </span>
        <Link to={`/models/${slug}/settings`} className="text-xs text-accent hover:underline">
          {t('common.edit')}
        </Link>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {configs.map(c => (
          <span key={c.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 text-xs font-medium">
            {c.keyword}
            {(c.min_cc || c.max_cc) && (
              <span className="text-amber-400/60 text-[10px]">
                {c.min_cc || '?'}-{c.max_cc || '?'}cc
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  ) : (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-center">
      <p className="text-xs text-amber-400 mb-1">{t('crawl.noSearchConfigs')}</p>
      <Link to={`/models/${slug}/settings`} className="text-xs text-accent hover:underline">
        {t('crawl.configureSearch')}
      </Link>
    </div>
  )}
</div>
```

Add the `useSearchConfigs` hook call near the top of the component alongside the other hooks. Import `Link` from `react-router-dom` (may already be imported).

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/CrawlPage.tsx
git commit -m "feat: add search config summary in crawl page"
```

---

### Task 8: i18n — Add translation keys

**Files:**
- Modify: `frontend/src/i18n/locales/fr.json`
- Modify: `frontend/src/i18n/locales/en.json`

- [ ] **Step 1: Add French translations**

In `fr.json`, add to the `"nav"` section:

```json
"settings": "Reglages"
```

Add to the `"crawl"` section:

```json
"searchConfigs": "{{count}} recherche(s) configuree(s)",
"noSearchConfigs": "Aucune recherche configuree",
"configureSearch": "Configurer la recherche"
```

Add a new `"settings"` top-level section:

```json
"settings": {
  "title": "Reglages",
  "searchConfig": {
    "title": "Configuration de recherche",
    "subtitle": "Parametres envoyes a LeBonCoin lors du crawl",
    "keyword": "Mot-cle",
    "keywordPlaceholder": "Ex: Himalayan 450",
    "minCc": "Cylindree min",
    "maxCc": "Cylindree max",
    "locations": "Localisation",
    "locationsPlaceholder": "Toute la France",
    "ownerType": "Type de vendeur",
    "ownerTypeOptions": {
      "private": "Particulier",
      "pro": "Professionnel",
      "all": "Tous"
    },
    "priceMin": "Prix min",
    "priceMax": "Prix max",
    "sort": "Tri",
    "sortOptions": {
      "relevance": "Pertinence",
      "newest": "Plus recents",
      "oldest": "Plus anciens",
      "cheapest": "Moins chers",
      "expensive": "Plus chers"
    },
    "searchInTitleOnly": "Titre uniquement",
    "addConfig": "Ajouter une recherche",
    "deleteConfirm": "Supprimer cette configuration ?",
    "emptyState": "Aucune configuration de recherche. Ajoutez-en une pour lancer un crawl.",
    "ccRange": "{{min}}-{{max}} cc",
    "priceRange": "{{min}}-{{max}} EUR"
  }
}
```

- [ ] **Step 2: Add English translations**

In `en.json`, add to the `"nav"` section:

```json
"settings": "Settings"
```

Add to the `"crawl"` section:

```json
"searchConfigs": "{{count}} search config(s)",
"noSearchConfigs": "No search configurations",
"configureSearch": "Configure search"
```

Add a new `"settings"` top-level section:

```json
"settings": {
  "title": "Settings",
  "searchConfig": {
    "title": "Search Configuration",
    "subtitle": "Parameters sent to LeBonCoin during crawl",
    "keyword": "Keyword",
    "keywordPlaceholder": "E.g.: Himalayan 450",
    "minCc": "Min CC",
    "maxCc": "Max CC",
    "locations": "Location",
    "locationsPlaceholder": "All of France",
    "ownerType": "Seller type",
    "ownerTypeOptions": {
      "private": "Private",
      "pro": "Professional",
      "all": "All"
    },
    "priceMin": "Min price",
    "priceMax": "Max price",
    "sort": "Sort",
    "sortOptions": {
      "relevance": "Relevance",
      "newest": "Newest first",
      "oldest": "Oldest first",
      "cheapest": "Cheapest first",
      "expensive": "Most expensive first"
    },
    "searchInTitleOnly": "Title only",
    "addConfig": "Add search config",
    "deleteConfirm": "Delete this configuration?",
    "emptyState": "No search configurations. Add one to start crawling.",
    "ccRange": "{{min}}-{{max}} cc",
    "priceRange": "{{min}}-{{max}} EUR"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/i18n/locales/fr.json frontend/src/i18n/locales/en.json
git commit -m "feat: add i18n keys for settings page and search config"
```
