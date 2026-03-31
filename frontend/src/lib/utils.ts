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

/** Badge color classes by bike color name */
export function variantColor(color: string | null): string {
  switch (color) {
    case 'Kaza Brown':
      return 'bg-[#2a3040] text-[#9aa5b8]'
    case 'Slate Himalayan Salt':
    case 'Slate Poppy Blue':
      return 'bg-blue-500/15 text-ui-blue'
    case 'Hanle Black':
      return 'bg-accent-subtle text-accent-text'
    case 'Kamet White':
      return 'bg-emerald-500/15 text-ui-emerald'
    case 'Mana Black':
      return 'bg-violet-500/15 text-ui-purple'
    default:
      return 'bg-tint/[0.06] text-text-muted'
  }
}

/** Chart color by bike color name */
export function variantChartColor(color: string): string {
  switch (color) {
    case 'Kaza Brown':
      return '#475569'
    case 'Slate Himalayan Salt':
    case 'Slate Poppy Blue':
      return '#3b82f6'
    case 'Hanle Black':
      return '#d4a853'
    case 'Kamet White':
      return '#10b981'
    case 'Mana Black':
      return '#8b5cf6'
    default:
      return '#6b7280'
  }
}
