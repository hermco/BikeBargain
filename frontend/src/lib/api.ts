import type { AdsResponse, AdDetail, Stats, Ranking, CrawlSearchResult, CrawlExtractResult, PriceHistory, CheckPricesResult, BikeModel, BikeModelDetail, BikeVariant } from '../types'
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

export function fetchAds(slug: string, params?: {
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

export interface CatalogAccessory {
  name: string
  category: string
  estimated_new_price: number
  default_new_price: number
  estimated_used_price: number
  group: string
  has_override: boolean
}

export function fetchAccessoryCatalog(slug: string): Promise<CatalogAccessory[]> {
  return fetchJSON<CatalogAccessory[]>(`/bike-models/${slug}/accessory-catalog`)
}

export function updateCatalogPrice(slug: string, group: string, estimated_new_price: number): Promise<{ group: string; estimated_new_price: number; ads_refreshed: number }> {
  return fetchJSON(`/bike-models/${slug}/accessory-catalog/${group}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ estimated_new_price }),
  })
}

export function resetCatalogPrice(slug: string, group: string): Promise<{ group: string; reset: boolean; ads_refreshed: number }> {
  return fetchJSON(`/bike-models/${slug}/accessory-catalog/${group}/override`, { method: 'DELETE' })
}

export function refreshAllAccessories(slug: string): Promise<{ ads_refreshed: number; ads_skipped_manual: number }> {
  return fetchJSON(`/bike-models/${slug}/accessories/refresh`, { method: 'POST' })
}

export function refreshAdAccessories(slug: string, adId: number): Promise<{ id: number; before: number; after: number }> {
  return fetchJSON(`/bike-models/${slug}/ads/${adId}/refresh-accessories`, { method: 'POST' })
}

export function markAdSold(slug: string, id: number, sold: boolean): Promise<{ updated: number }> {
  return fetchJSON(`/bike-models/${slug}/ads/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sold: sold ? 1 : 0 }),
  })
}

export function checkAdsOnline(slug: string): Promise<{ checked: number; newly_sold: number; details: Array<{ id: number; sold: boolean; reason?: string }> }> {
  return fetchJSON(`/bike-models/${slug}/ads/check-online`, { method: 'POST' })
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

export function checkAdOnline(slug: string, id: number): Promise<{ id: number; sold: boolean; reason?: string }> {
  return fetchJSON(`/bike-models/${slug}/ads/${id}/check-online`, { method: 'POST' })
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

export function removeCrawlSessionAd(slug: string, sessionId: number, adId: number): Promise<{ removed: number }> {
  return fetchJSON(`/bike-models/${slug}/crawl/sessions/${sessionId}/ads/${adId}`, { method: 'DELETE' })
}
