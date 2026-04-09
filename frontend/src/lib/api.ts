import type { AdsResponse, AdDetail, Stats, Ranking, CrawlSearchResult, CrawlExtractResult, PriceHistory, CheckPricesResult, BikeModel, BikeModelDetail, BikeVariant, Accessory, SearchConfig, LbcEnums, ListingStatus, StatusHistory } from '../types'
import { config } from '../config'

const BASE = `${config.apiBaseUrl}/api`

export interface CheckDetailItem {
  id: number
  listing_status: ListingStatus
  previous_status?: ListingStatus | null
  changed?: boolean
  reason?: string
}

export interface CheckResult {
  checked: number
  changes: number
  back_online: number
  details: CheckDetailItem[]
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, init)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

// ─── Bike Models ─────────────────────────────────────────────────────────────

export function fetchBikeModels(): Promise<BikeModel[]> {
  return fetchJSON<BikeModel[]>('/bike-models')
}

export function fetchBikeModel(slug: string): Promise<BikeModelDetail> {
  return fetchJSON<BikeModelDetail>(`/bike-models/${slug}`)
}

export function fetchBikeVariants(slug: string): Promise<BikeVariant[]> {
  return fetchJSON<BikeVariant[]>(`/bike-models/${slug}/variants`)
}

export function fetchAdModelSlug(id: number): Promise<{ ad_id: number; slug: string | null }> {
  return fetchJSON<{ ad_id: number; slug: string | null }>(`/ads/${id}/model-slug`)
}

// ─── Ads ─────────────────────────────────────────────────────────────────────

export interface FetchAdsParams {
  variant?: string
  search?: string
  sort?: string
  min_price?: number
  max_price?: number
  limit?: number
  offset?: number
}

export function fetchAds(slug: string, params?: FetchAdsParams): Promise<AdsResponse> {
  const sp = new URLSearchParams()
  if (params?.variant) sp.set('variant', params.variant)
  if (params?.search) sp.set('search', params.search)
  if (params?.sort) sp.set('sort', params.sort)
  if (params?.min_price != null) sp.set('min_price', String(params.min_price))
  if (params?.max_price != null) sp.set('max_price', String(params.max_price))
  if (params?.limit != null) sp.set('limit', String(params.limit))
  if (params?.offset != null) sp.set('offset', String(params.offset))
  const qs = sp.toString()
  return fetchJSON<AdsResponse>(`/bike-models/${slug}/ads${qs ? '?' + qs : ''}`)
}

export function fetchAd(slug: string, id: number): Promise<AdDetail> {
  return fetchJSON<AdDetail>(`/bike-models/${slug}/ads/${id}`)
}

export function previewAd(slug: string, url: string): Promise<AdDetail> {
  return fetchJSON(`/bike-models/${slug}/ads/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
}

export function confirmAd(slug: string, adData: Record<string, unknown>): Promise<{ id: number; subject: string; price: number }> {
  return fetchJSON(`/bike-models/${slug}/ads/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ad_data: adData }),
  })
}

export function addAd(slug: string, url: string): Promise<{ id: number; subject: string; price: number }> {
  return fetchJSON(`/bike-models/${slug}/ads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
}

export function updateAd(slug: string, id: number, data: {
  color?: string
  variant?: string
  wheel_type?: string
  accessories?: Array<{ name: string; category: string; source: string; estimated_new_price: number; estimated_used_price: number }>
}): Promise<{ updated: number }> {
  return fetchJSON(`/bike-models/${slug}/ads/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function deleteAd(slug: string, id: number): Promise<{ deleted: number }> {
  return fetchJSON(`/bike-models/${slug}/ads/${id}`, { method: 'DELETE' })
}

export function refreshAllAccessories(slug: string): Promise<{ ads_skipped_manual: number; status: string }> {
  return fetchJSON(`/bike-models/${slug}/accessories/refresh`, { method: 'POST' })
}

export function refreshAdAccessories(slug: string, adId: number): Promise<{ id: number; before: number; after: number }> {
  return fetchJSON(`/bike-models/${slug}/ads/${adId}/refresh-accessories`, { method: 'POST' })
}

export function updateAdStatus(slug: string, id: number, listing_status: ListingStatus): Promise<{ updated: number }> {
  return fetchJSON(`/bike-models/${slug}/ads/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listing_status }),
  })
}

export function checkAdsOnline(slug: string): Promise<CheckResult> {
  return fetchJSON(`/bike-models/${slug}/ads/check-online`, { method: 'POST' })
}

export function checkAdsOnlineFull(slug: string): Promise<CheckResult> {
  return fetchJSON(`/bike-models/${slug}/ads/check-online-full`, { method: 'POST' })
}

export function mergeAd(slug: string, newAdData: Record<string, unknown>, oldAdId: number): Promise<{ id: number; old_ad_id: number; price_delta: number; subject: string }> {
  return fetchJSON(`/bike-models/${slug}/ads/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_ad_data: newAdData, old_ad_id: oldAdId }),
  })
}

export function fetchPriceHistory(slug: string, adId: number): Promise<PriceHistory> {
  return fetchJSON<PriceHistory>(`/bike-models/${slug}/ads/${adId}/price-history`)
}

export function checkAdOnline(slug: string, id: number): Promise<CheckDetailItem> {
  return fetchJSON(`/bike-models/${slug}/ads/${id}/check-online`, { method: 'POST' })
}

export function fetchStatusHistory(slug: string, adId: number): Promise<StatusHistory> {
  return fetchJSON<StatusHistory>(`/bike-models/${slug}/ads/${adId}/status-history`)
}

export function fetchStats(slug: string): Promise<Stats> {
  return fetchJSON<Stats>(`/bike-models/${slug}/stats`)
}

export function fetchRankings(slug: string): Promise<Ranking[]> {
  return fetchJSON<Ranking[]>(`/bike-models/${slug}/rankings`)
}

export function checkPrices(slug: string): Promise<CheckPricesResult> {
  return fetchJSON<CheckPricesResult>(`/bike-models/${slug}/ads/check-prices`, { method: 'POST' })
}

export function confirmPrice(slug: string, adId: number, newPrice: number): Promise<{ id: number; price_delta: number; new_price: number }> {
  return fetchJSON(`/bike-models/${slug}/ads/${adId}/confirm-price`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_price: newPrice }),
  })
}

// ─── Catalog V2 ──────────────────────────────────────────────────────────

export interface CatalogVariant {
  id: number
  group_id: number
  name: string
  qualifiers: string[]
  brands: string[]
  product_aliases: string[]
  optional_words: string[]
  regex_override: string | null
  estimated_new_price: number
  sort_order: number
  sort_order_manual: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CatalogGroup {
  id: number
  group_key: string
  model_id: number | null
  name: string
  category: string
  expressions: string[]
  default_price: number
  last_match_count: number
  created_at: string
  updated_at: string
  variants: CatalogVariant[]
}

export interface SynonymSuggestion {
  expression: string
  rule: 'prefix' | 'equivalence'
  context: string
}

export interface PreviewRegexResult {
  generated_regex: string
  matching_ads_count: number
  matching_ads_sample: Array<{ id: number; title: string; matched_text: string }>
  warning?: string
}

export interface PreviewDiffResult {
  before: { matching_ads_count: number }
  after: { matching_ads_count: number }
  gained: Array<{ id: number; title: string }>
  lost: Array<{ id: number; title: string }>
}

export interface TestOnAdMatch {
  group: string
  group_key: string
  variant: string
  matched_text: string
}

export interface RefreshStatus {
  status: 'running' | 'idle' | 'error'
  updated_ads_count: number
  last_refresh: string | null
}

export function fetchCatalogGroups(): Promise<CatalogGroup[]> {
  return fetchJSON<CatalogGroup[]>('/catalog/groups')
}

export function fetchCatalogGroup(id: number): Promise<CatalogGroup> {
  return fetchJSON<CatalogGroup>(`/catalog/groups/${id}`)
}

export function createCatalogGroup(data: {
  name: string; category: string; expressions: string[]; default_price: number
}): Promise<CatalogGroup[]> {
  return fetchJSON('/catalog/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function updateCatalogGroup(id: number, data: Partial<{
  name: string; category: string; expressions: string[]; default_price: number
}>): Promise<{ id: number; name: string; status: string }> {
  return fetchJSON(`/catalog/groups/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function deleteCatalogGroup(id: number): Promise<{ deleted: number }> {
  return fetchJSON(`/catalog/groups/${id}`, { method: 'DELETE' })
}

export function createCatalogVariant(groupId: number, data: {
  name: string; qualifiers?: string[]; brands?: string[]; product_aliases?: string[]
  optional_words?: string[]; regex_override?: string | null
  estimated_new_price: number; sort_order?: number; notes?: string | null
}): Promise<{ id: number; name: string; status: string }> {
  return fetchJSON(`/catalog/groups/${groupId}/variants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function updateCatalogVariant(id: number, data: Partial<CatalogVariant>): Promise<{ id: number; name: string; status: string }> {
  return fetchJSON(`/catalog/variants/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function deleteCatalogVariant(id: number): Promise<{ deleted: number }> {
  return fetchJSON(`/catalog/variants/${id}`, { method: 'DELETE' })
}

export function suggestSynonyms(expression: string): Promise<{
  normalized: string; suggestions: SynonymSuggestion[]
}> {
  return fetchJSON('/catalog/suggest-synonyms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expression }),
  })
}

export function previewRegex(data: {
  group_expressions: string[]; qualifiers?: string[]; brands?: string[]
  product_aliases?: string[]; optional_words?: string[]; regex_override?: string | null
}): Promise<PreviewRegexResult> {
  return fetchJSON('/catalog/preview-regex', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function previewDiff(data: {
  variant_id: number; group_expressions: string[]; qualifiers?: string[]
  brands?: string[]; product_aliases?: string[]; optional_words?: string[]
  regex_override?: string | null
}): Promise<PreviewDiffResult> {
  return fetchJSON('/catalog/preview-diff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function testOnAd(data: { ad_id?: number; text?: string }): Promise<{ matches: TestOnAdMatch[] }> {
  return fetchJSON('/catalog/test-on-ad', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function resetCatalog(): Promise<{ status: string }> {
  return fetchJSON('/catalog/reset', { method: 'POST' })
}

export function exportCatalog(): Promise<{ groups: CatalogGroup[] }> {
  return fetchJSON('/catalog/export')
}

export function importCatalog(data: { groups: unknown[] }): Promise<{ status: string }> {
  return fetchJSON('/catalog/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function fetchRefreshStatus(): Promise<RefreshStatus> {
  return fetchJSON<RefreshStatus>('/catalog/refresh-status')
}

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

// ─── Crawl ────────────────────────────────────────────────────────────────

export function crawlSearch(slug: string): Promise<CrawlSearchResult & { session_id: number }> {
  return fetchJSON<CrawlSearchResult & { session_id: number }>(`/bike-models/${slug}/crawl/search`)
}

export function crawlExtract(slug: string, adId: number, url: string): Promise<CrawlExtractResult> {
  return fetchJSON<CrawlExtractResult>(`/bike-models/${slug}/crawl/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ad_id: adId, url }),
  })
}

export interface CrawlSessionAd {
  id: number
  url: string
  subject: string | null
  price: number | null
  city: string | null
  department: string | null
  thumbnail: string | null
  exists_in_db: boolean
  action: string
  is_new_listing?: boolean
  is_irrelevant?: boolean
}

export interface CrawlSession {
  session_id: number
  status: string
  total_ads: number
  created_at: string
  ads: CrawlSessionAd[]
}

export function fetchActiveCrawlSession(slug: string): Promise<CrawlSession | null> {
  return fetchJSON<CrawlSession | null>(`/bike-models/${slug}/crawl/sessions/active`)
}

export function fetchCrawlSession(slug: string, sessionId: number): Promise<CrawlSession> {
  return fetchJSON<CrawlSession>(`/bike-models/${slug}/crawl/sessions/${sessionId}`)
}

export function updateCrawlAdAction(slug: string, sessionId: number, adId: number, action: string): Promise<{ updated: boolean }> {
  return fetchJSON(`/bike-models/${slug}/crawl/sessions/${sessionId}/ads/${adId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  })
}

export function closeCrawlSession(slug: string, sessionId: number): Promise<{ closed: number }> {
  return fetchJSON(`/bike-models/${slug}/crawl/sessions/${sessionId}`, { method: 'DELETE' })
}

export function redetectAccessories(slug: string, body: string): Promise<{ accessories: Accessory[] }> {
  return fetchJSON(`/bike-models/${slug}/ads/redetect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
}

export function removeCrawlSessionAd(slug: string, sessionId: number, adId: number): Promise<{ removed: number }> {
  return fetchJSON(`/bike-models/${slug}/crawl/sessions/${sessionId}/ads/${adId}`, { method: 'DELETE' })
}
