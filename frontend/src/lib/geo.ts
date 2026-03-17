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

export const DISTANCE_BAND_CONFIG: Record<DistanceBand, { label: string; color: string; bg: string }> = {
  close:    { label: 'Proche',       color: 'text-emerald-300', bg: 'bg-emerald-500/15' },
  medium:   { label: 'Moyen',        color: 'text-amber-300',   bg: 'bg-amber-500/15' },
  far:      { label: 'Loin',         color: 'text-orange-300',  bg: 'bg-orange-500/15' },
  very_far: { label: 'Tres loin',    color: 'text-red-300',     bg: 'bg-red-500/15' },
}
