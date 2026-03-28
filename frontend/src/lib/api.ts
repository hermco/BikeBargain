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

export interface CatalogAccessory {
  name: string
  category: string
  estimated_new_price: number
  default_new_price: number
  estimated_used_price: number
  group: string
  has_override: boolean
}

export function fetchAccessoryCatalog(): Promise<CatalogAccessory[]> {
  return fetchJSON<CatalogAccessory[]>('/accessory-catalog')
}

export function updateCatalogPrice(group: string, estimated_new_price: number): Promise<{ group: string; estimated_new_price: number; ads_refreshed: number }> {
  return fetchJSON(`/accessory-catalog/${group}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ estimated_new_price }),
  })
}

export function resetCatalogPrice(group: string): Promise<{ group: string; reset: boolean; ads_refreshed: number }> {
  return fetchJSON(`/accessory-catalog/${group}/override`, { method: 'DELETE' })
}

export function refreshAllAccessories(): Promise<{ ads_refreshed: number; ads_skipped_manual: number }> {
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
