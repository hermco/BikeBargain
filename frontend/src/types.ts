export interface Ad {
  id: number
  url: string
  subject: string | null
  body: string | null
  price: number | null
  brand: string | null
  model: string | null
  year: number | null
  mileage_km: number | null
  engine_size_cc: number | null
  fuel_type: string | null
  color: string | null
  category_name: string | null
  ad_type: string | null
  status: string | null
  has_phone: number
  city: string | null
  zipcode: string | null
  department: string | null
  region: string | null
  lat: number | null
  lng: number | null
  seller_type: string | null
  first_publication_date: string | null
  expiration_date: string | null
  variant: string | null
  wheel_type: string | null
  estimated_new_price: number | null
  extracted_at: string
  updated_at: string
  sold: number
  previous_ad_id: number | null
  superseded_by: number | null
  accessories: Accessory[]
  images: string[]
}

export interface AdDetail extends Ad {
  attributes: AdAttribute[]
}

export interface Accessory {
  name: string
  category: string
  source: string
  estimated_new_price: number
  estimated_used_price: number
}

export interface AdAttribute {
  key: string
  value: string | null
  value_label: string | null
}

export interface Stats {
  count: number
  price: {
    min: number | null
    max: number | null
    mean: number | null
    median: number | null
  }
  mileage: {
    min: number | null
    max: number | null
    mean: number | null
  }
  years: { min: number | null; max: number | null }
  variants: { name: string; count: number }[]
  departments: { name: string; count: number }[]
  top_accessories: { name: string; count: number; pct: number }[]
  prices_list: number[]
  mileages_list: number[]
}

export interface WearDetail {
  name: string
  garage_cost: number
  life_km: number
  wear_pct: number
  cost_consumed: number
  remaining_km: number
  short_term: boolean
}

export interface Warranty {
  circulation_date: string | null
  expiry_date: string | null
  remaining_days: number
  remaining_years: number
  value: number
}

export interface ShortTermItem {
  name: string
  garage_cost: number
  remaining_km: number
  reason: string
}

export interface Ranking {
  id: number
  url: string
  sold: boolean
  city: string
  variant: string
  color: string
  wheel_type: string
  year: number | null
  km: number
  price: number
  new_price: number
  accessories: Accessory[]
  acc_count: number
  acc_new_total: number
  acc_used_total: number
  wear_total: number
  wear_details: WearDetail[]
  mechanical_wear: number
  condition_risk: number
  warranty: Warranty
  effective_price: number
  decote_pct: number
  short_term_items: ShortTermItem[]
  short_term_total: number
}

export interface AdsResponse {
  total: number
  ads: Ad[]
}

// ─── Crawl ────────────────────────────────────────────────────────────────

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
}

export interface CrawlSearchResult {
  total: number
  ads: CrawlAdSummary[]
}

export interface CrawlDiff {
  field: string
  label: string
  old: unknown
  new: unknown
  added?: string[]
  removed?: string[]
}

export interface PotentialDuplicate {
  id: number
  url: string
  subject: string
  price: number | null
  city: string | null
  department: string | null
  variant: string | null
  color: string | null
  sold: boolean
  mileage_km: number | null
  score: number
  reasons: string[]
  price_delta: number | null
}

export interface PriceHistoryEntry {
  id: number
  ad_id: number
  previous_ad_id: number | null
  price: number
  source: 'initial' | 'repost' | 'manual'
  note: string | null
  recorded_at: string
}

export interface PriceHistory {
  ad_id: number
  current_price: number | null
  previous_ad_id: number | null
  history: PriceHistoryEntry[]
}

export interface CrawlRepostMatch {
  id: number
  subject: string | null
  price: number | null
  city: string | null
  sold?: boolean
  price_delta?: number
}

export interface CrawlExtractResult {
  ad_data: Record<string, unknown>
  exists_in_db: boolean
  existing: Record<string, unknown> | null
  diffs: CrawlDiff[]
  potential_duplicates: PotentialDuplicate[]
}
