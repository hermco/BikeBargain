import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(price: number | null | undefined, locale = 'fr-FR'): string {
  if (price == null) return 'N/A'
  return `${price.toLocaleString(locale)} \u20ac`
}

export function formatKm(km: number | null | undefined, locale = 'fr-FR'): string {
  if (km == null) return 'N/A'
  return `${km.toLocaleString(locale)} km`
}

export function formatDate(dateStr: string | null | undefined, locale = 'fr-FR'): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}

/** Hardcoded fallback — prefer useVariantOptions().variantColor() when model context is available */
export function variantColor(variant: string | null): string {
  switch (variant) {
    case 'Base':
      return 'bg-[#2a3040] text-[#9aa5b8]'
    case 'Pass':
      return 'bg-blue-500/15 text-blue-300'
    case 'Summit':
      return 'bg-amber-500/15 text-amber-300'
    case 'Mana Black':
      return 'bg-violet-500/15 text-violet-300'
    default:
      return 'bg-white/[0.06] text-text-muted'
  }
}

/** Hardcoded fallback — prefer useVariantOptions().variantChartColor() when model context is available */
export function variantChartColor(variant: string): string {
  switch (variant) {
    case 'Base':
      return '#475569'
    case 'Pass':
      return '#3b82f6'
    case 'Summit':
      return '#d4a853'
    case 'Mana Black':
      return '#8b5cf6'
    default:
      return '#6b7280'
  }
}
