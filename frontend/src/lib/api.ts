import type { AdsResponse, AdDetail, Stats, Ranking, CrawlSearchResult, CrawlExtractResult, PriceHistory, CheckPricesResult } from '../types'
import { config } from '../config'

const BASE = `${config.apiBaseUrl}/api`

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, init)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

export function fetchAds(params?: {
  variant?: string
  min_price?: number
  max_price?: number
  limit?: number
  offset?: number
}): Promise<AdsResponse> {
  const sp = new URLSearchParams()
  if (params?.variant) sp.set('variant', params.variant)
  if (params?.min_price != null) sp.set('min_price', String(params.min_price))
  if (params?.max_price != null) sp.set('max_price', String(params.max_price))
  if (params?.limit != null) sp.set('limit', String(params.limit))
  if (params?.offset != null) sp.set('offset', String(params.offset))
  const qs = sp.toString()
  return fetchJSON<AdsResponse>(`/ads${qs ? '?' + qs : ''}`)
}

export function fetchAd(id: number): Promise<AdDetail> {
  return fetchJSON<AdDetail>(`/ads/${id}`)
}

export function previewAd(url: string): Promise<AdDetail> {
  return fetchJSON(`/ads/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
}

export function confirmAd(adData: Record<string, unknown>): Promise<{ id: number; subject: string; price: number }> {
  return fetchJSON(`/ads/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ad_data: adData }),
  })
}

export function addAd(url: string): Promise<{ id: number; subject: string; price: number }> {
  return fetchJSON(`/ads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
}

export function updateAd(id: number, data: {
  color?: string
  variant?: string
  wheel_type?: string
  accessories?: Array<{ name: string; category: string; source: string; estimated_new_price: number; estimated_used_price: number }>
}): Promise<{ updated: number }> {
  return fetchJSON(`/ads/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function deleteAd(id: number): Promise<{ deleted: number }> {
  return fetchJSON(`/ads/${id}`, { method: 'DELETE' })
}

export function refreshAllAccessories(): Promise<{ ads_skipped_manual: number; status: string }> {
  return fetchJSON('/accessories/refresh', { method: 'POST' })
}

export function refreshAdAccessories(adId: number): Promise<{ id: number; before: number; after: number }> {
  return fetchJSON(`/ads/${adId}/refresh-accessories`, { method: 'POST' })
}

export function markAdSold(id: number, sold: boolean): Promise<{ updated: number }> {
  return fetchJSON(`/ads/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sold: sold ? 1 : 0 }),
  })
}

export function checkAdsOnline(): Promise<{ checked: number; newly_sold: number; details: Array<{ id: number; sold: boolean; reason?: string }> }> {
  return fetchJSON('/ads/check-online', { method: 'POST' })
}

export function mergeAd(newAdData: Record<string, unknown>, oldAdId: number): Promise<{ id: number; old_ad_id: number; price_delta: number; subject: string }> {
  return fetchJSON('/ads/merge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_ad_data: newAdData, old_ad_id: oldAdId }),
  })
}

export function fetchPriceHistory(adId: number): Promise<PriceHistory> {
  return fetchJSON<PriceHistory>(`/ads/${adId}/price-history`)
}

export function checkAdOnline(id: number): Promise<{ id: number; sold: boolean; reason?: string }> {
  return fetchJSON(`/ads/${id}/check-online`, { method: 'POST' })
}

export function fetchStats(): Promise<Stats> {
  return fetchJSON<Stats>('/stats')
}

export function fetchRankings(): Promise<Ranking[]> {
  return fetchJSON<Ranking[]>('/rankings')
}

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

// ─── Crawl ────────────────────────────────────────────────────────────────

export function crawlSearch(): Promise<CrawlSearchResult & { session_id: number }> {
  return fetchJSON<CrawlSearchResult & { session_id: number }>('/crawl/search')
}

export function crawlExtract(adId: number, url: string): Promise<CrawlExtractResult> {
  return fetchJSON<CrawlExtractResult>('/crawl/extract', {
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
}

export interface CrawlSession {
  session_id: number
  status: string
  total_ads: number
  created_at: string
  ads: CrawlSessionAd[]
}

export function fetchActiveCrawlSession(): Promise<CrawlSession | null> {
  return fetchJSON<CrawlSession | null>('/crawl/sessions/active')
}

export function updateCrawlAdAction(sessionId: number, adId: number, action: string): Promise<{ updated: boolean }> {
  return fetchJSON(`/crawl/sessions/${sessionId}/ads/${adId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  })
}

export function closeCrawlSession(sessionId: number): Promise<{ closed: number }> {
  return fetchJSON(`/crawl/sessions/${sessionId}`, { method: 'DELETE' })
}

export function removeCrawlSessionAd(sessionId: number, adId: number): Promise<{ removed: number }> {
  return fetchJSON(`/crawl/sessions/${sessionId}/ads/${adId}`, { method: 'DELETE' })
}
