// Utilitaires de geolocalisation : haversine, geocoding, localStorage

export interface UserLocation {
  label: string
  lat: number
  lng: number
}

export interface GeoSuggestion {
  label: string
  city: string
  postcode: string
  lat: number
  lng: number
}

const STORAGE_KEY = 'user_location'

// ─── localStorage ────────────────────────────────────────────────────────────

export function getUserLocation(): UserLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as UserLocation
  } catch {
    return null
  }
}

export function setUserLocation(loc: UserLocation): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(loc))
}

export function clearUserLocation(): void {
  localStorage.removeItem(STORAGE_KEY)
}

// ─── Haversine ───────────────────────────────────────────────────────────────

const R = 6371 // rayon terre en km

export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Geocoding (api-adresse.data.gouv.fr) ────────────────────────────────────

export async function geocodeSearch(query: string): Promise<GeoSuggestion[]> {
  if (!query || query.length < 2) return []

  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5&type=municipality`
  const res = await fetch(url)
  if (!res.ok) return []

  const data = await res.json()
  return (data.features || []).map((f: Record<string, unknown>) => {
    const props = f.properties as Record<string, string>
    const [lng, lat] = (f.geometry as { coordinates: [number, number] }).coordinates
    return {
      label: props.label,
      city: props.city || props.name,
      postcode: props.postcode,
      lat,
      lng,
    }
  })
}

// ─── Distance helpers ────────────────────────────────────────────────────────

export type DistanceBand = 'close' | 'medium' | 'far' | 'very_far'

export function distanceBand(km: number): DistanceBand {
  if (km < 150) return 'close'
  if (km < 400) return 'medium'
  if (km < 700) return 'far'
  return 'very_far'
}

export const DISTANCE_BAND_CONFIG: Record<DistanceBand, { labelKey: string; color: string; bg: string }> = {
  close:    { labelKey: 'ranking.distanceBand.close',    color: 'text-ui-emerald', bg: 'bg-emerald-500/15' },
  medium:   { labelKey: 'ranking.distanceBand.medium',   color: 'text-accent-text',    bg: 'bg-amber-500/15' },
  far:      { labelKey: 'ranking.distanceBand.far',      color: 'text-ui-orange',  bg: 'bg-orange-500/15' },
  very_far: { labelKey: 'ranking.distanceBand.very_far', color: 'text-ui-red',     bg: 'bg-red-500/15' },
}

// ─── Temps de trajet (OSRM) ─────────────────────────────────────────────────

export interface TravelInfo {
  durationSec: number
  distanceKm: number
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (h === 0) return `${m} mn`
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

export function travelTimeBand(sec: number): DistanceBand {
  if (sec < 3600) return 'close'       // < 1h
  if (sec < 9000) return 'medium'      // < 2h30
  if (sec < 18000) return 'far'        // < 5h
  return 'very_far'
}

// ─── Cache trajet (localStorage) ────────────────────────────────────────────

const TRAVEL_CACHE_KEY = 'travel_cache'
const TRAVEL_CACHE_TTL = 24 * 60 * 60 * 1000 // 24h

interface TravelCacheEntry {
  durationSec: number
  distanceKm: number
  ts: number
}

/** Clé de cache : coordonnées origin + destination arrondies à ~1 km. */
function travelCacheCoordKey(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
): string {
  const r = (n: number) => n.toFixed(2)
  return `${r(origin.lat)},${r(origin.lng)}>${r(dest.lat)},${r(dest.lng)}`
}

function loadTravelCache(): Record<string, TravelCacheEntry> {
  try {
    const raw = localStorage.getItem(TRAVEL_CACHE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, TravelCacheEntry>
  } catch {
    return {}
  }
}

function saveTravelCache(cache: Record<string, TravelCacheEntry>): void {
  try {
    localStorage.setItem(TRAVEL_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // quota exceeded — purge et retry
    localStorage.removeItem(TRAVEL_CACHE_KEY)
  }
}

export async function fetchTravelTimes(
  origin: { lat: number; lng: number },
  destinations: { id: number; lat: number; lng: number }[],
): Promise<Map<number, TravelInfo>> {
  const result = new Map<number, TravelInfo>()
  if (destinations.length === 0) return result

  const now = Date.now()
  const cache = loadTravelCache()

  // Séparer les destinations déjà en cache de celles à fetcher
  const toFetch: typeof destinations = []
  for (const d of destinations) {
    const key = travelCacheCoordKey(origin, d)
    const entry = cache[key]
    if (entry && now - entry.ts < TRAVEL_CACHE_TTL) {
      result.set(d.id, { durationSec: entry.durationSec, distanceKm: entry.distanceKm })
    } else {
      toFetch.push(d)
    }
  }

  if (toFetch.length === 0) return result

  const coords = [
    `${origin.lng},${origin.lat}`,
    ...toFetch.map((d) => `${d.lng},${d.lat}`),
  ].join(';')

  try {
    const res = await fetch(
      `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=duration,distance`,
    )
    if (!res.ok) return result
    const data = await res.json()
    if (data.code !== 'Ok') return result

    const durations = data.durations[0] as (number | null)[]
    const distances = data.distances[0] as (number | null)[]

    let dirty = false
    for (let i = 0; i < toFetch.length; i++) {
      const dur = durations[i + 1]
      const dist = distances[i + 1]
      if (dur != null && dist != null) {
        const info = { durationSec: dur, distanceKm: dist / 1000 }
        result.set(toFetch[i].id, info)
        cache[travelCacheCoordKey(origin, toFetch[i])] = { ...info, ts: now }
        dirty = true
      }
    }

    // Purger les entrées expirées et sauver
    if (dirty) {
      for (const k of Object.keys(cache)) {
        if (now - cache[k].ts > TRAVEL_CACHE_TTL) delete cache[k]
      }
      saveTravelCache(cache)
    }
  } catch {
    // OSRM indisponible — fallback haversine cote appelant
  }

  return result
}
