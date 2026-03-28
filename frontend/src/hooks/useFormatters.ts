import { useTranslation } from 'react-i18next'
import { formatPrice, formatKm, formatDate } from '../lib/utils'

const LOCALE_MAP: Record<string, string> = { fr: 'fr-FR', en: 'en-US' }

export function useFormatters() {
  const { i18n } = useTranslation()
  const locale = LOCALE_MAP[i18n.language] || 'fr-FR'
  return {
    formatPrice: (price: number | null | undefined) => formatPrice(price, locale),
    formatKm: (km: number | null | undefined) => formatKm(km, locale),
    formatDate: (date: string) => formatDate(date, locale),
  }
}
