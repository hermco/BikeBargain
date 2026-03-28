import { Link } from 'react-router-dom'
import { MapPin, CircleGauge, Calendar } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { Ad } from '../types'
import { Badge } from './ui/Badge'
import { variantColor } from '../lib/utils'
import { useFormatters } from '../hooks/useFormatters'

interface AdCardProps {
  ad: Ad
  index: number
}

function getDealLevel(ad: Ad, t: (key: string) => string): { label: string; className: string } | null {
  if (ad.price == null || ad.estimated_new_price == null) return null
  const decote = ((ad.estimated_new_price - ad.price) / ad.estimated_new_price) * 100
  if (decote > 20) return { label: t('adCard.goodDeal'), className: 'bg-emerald-500/90 text-white' }
  if (decote < 5) return { label: t('adCard.highPrice'), className: 'bg-red-500/80 text-white' }
  return null
}

export function AdCard({ ad, index }: AdCardProps) {
  const { t } = useTranslation()
  const { formatPrice, formatKm, formatDate } = useFormatters()
  const heroImage = ad.images?.[0]
  const accCount = ad.accessories?.length ?? 0
  const deal = getDealLevel(ad, t)
  const isSold = !!ad.sold

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={isSold ? 'opacity-60' : ''}
    >
      <Link
        to={`/ads/${ad.id}`}
        className="group block rounded-2xl border border-white/[0.06] bg-surface/80 backdrop-blur-sm hover:border-amber-500/20 hover:shadow-2xl hover:shadow-amber-500/[0.05] transition-all duration-300 relative"
      >
        {/* Image */}
        <div className="relative h-56 bg-bg overflow-hidden rounded-t-2xl">
          {heroImage ? (
            <img
              src={heroImage}
              alt={ad.subject ?? ''}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500 ease-out"
              loading="lazy"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-[#2a3040] text-sm">
              {t('common.noImage')}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-transparent opacity-80" />
          {isSold && (
            <div className="absolute top-3 right-3 z-10">
              <Badge className="bg-red-500/90 text-white text-xs font-semibold px-2.5 py-1">{t('common.sold')}</Badge>
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 px-4 py-3 flex items-end justify-between">
            <span className="text-xl font-semibold text-white drop-shadow-lg font-fraunces">
              {formatPrice(ad.price)}
            </span>
            {deal && !isSold && (
              <Badge className={deal.className}>
                {deal.label}
              </Badge>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col gap-3">
          <h3 className="text-sm font-medium text-text-primary line-clamp-1 group-hover:text-amber-200 transition-colors">
            {ad.subject ?? t('common.noTitle')}
          </h3>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={variantColor(ad.variant)}>
              {ad.variant ?? t('common.na')}
            </Badge>
            {ad.color && (
              <Badge className="bg-white/[0.06] text-text-secondary">{ad.color}</Badge>
            )}
            {accCount > 0 && (
              <Badge className="bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
                {accCount} acc.
              </Badge>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-text-muted">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {ad.city ?? '?'}
            </span>
            {ad.first_publication_date && (
              <span className="flex items-center gap-1.5 text-text-dim">
                <Calendar className="h-3 w-3" />
                {formatDate(ad.first_publication_date)}
              </span>
            )}
          </div>

          {/* Kilometrage avec jauge integree */}
          {ad.mileage_km != null && (() => {
            const ratio = Math.min(ad.mileage_km / 50000, 1)
            const kmColor = ratio < 0.3
              ? 'from-emerald-500/70 to-emerald-400/50'
              : ratio < 0.6
                ? 'from-amber-500/70 to-amber-400/50'
                : 'from-red-500/70 to-red-400/50'
            const textColor = ratio < 0.3
              ? 'text-emerald-400'
              : ratio < 0.6
                ? 'text-amber-400'
                : 'text-red-400'
            return (
              <div className="flex items-center gap-2" style={{ minHeight: '20px' }}>
                <CircleGauge className="h-4 w-4 shrink-0 text-text-muted" style={{ overflow: 'visible' }} />
                <div className="flex-1 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-text-muted">{t('adCard.mileage')}</span>
                    <span className={`text-[11px] tabular-nums font-medium ${textColor}`}>
                      {formatKm(ad.mileage_km)}
                    </span>
                  </div>
                  <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div
                      className={`bg-gradient-to-r ${kmColor}`}
                      style={{ height: '100%', width: `${ratio * 100}%`, borderRadius: '9999px' }}
                    />
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </Link>
    </motion.div>
  )
}
