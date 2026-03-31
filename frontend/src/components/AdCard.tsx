import { MapPin, CircleGauge, Calendar, Sparkles, TriangleAlert, Wrench } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { Ad } from '../types'
import { Badge } from './ui/Badge'
import { variantColor } from '../lib/utils'
import { useFormatters } from '../hooks/useFormatters'
import { useCurrentModel } from '../hooks/useCurrentModel'
import { Link } from 'react-router-dom'

interface AdCardProps {
  ad: Ad
  index: number
}

function getDealLevel(ad: Ad, t: (key: string) => string): { label: string; className: string; icon: 'sparkle' | 'warning' } | null {
  if (ad.price == null || ad.estimated_new_price == null) return null
  const decote = ((ad.estimated_new_price - ad.price) / ad.estimated_new_price) * 100
  if (decote > 20) return { label: t('adCard.goodDeal'), className: 'bg-emerald-500/90 text-white', icon: 'sparkle' }
  if (decote < 5) return { label: t('adCard.highPrice'), className: 'bg-red-500/80 text-white', icon: 'warning' }
  return null
}

export function AdCard({ ad, index }: AdCardProps) {
  const { t } = useTranslation()
  const { formatPrice, formatKm, formatDate } = useFormatters()
  const { modelUrl } = useCurrentModel()
  const heroImage = ad.images?.[0]
  const accCount = ad.accessories?.length ?? 0
  const deal = getDealLevel(ad, t)
  const isSold = !!ad.sold

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.04, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={isSold ? 'opacity-60' : ''}
    >
      <Link
        to={modelUrl(`/ads/${ad.id}`)}
        className="group block rounded-2xl border border-tint/[0.06] bg-surface/80 backdrop-blur-sm hover:border-amber-500/25 hover:shadow-[0_8px_40px_rgba(212,168,83,0.1),0_0_0_1px_rgba(212,168,83,0.1)] transition-all duration-500 ease-out relative hover:-translate-y-1.5"
      >
        {/* Image */}
        <div className="relative h-48 bg-bg overflow-hidden rounded-t-2xl">
          {/* Top inner shadow for depth */}
          <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-black/30 to-transparent z-10 pointer-events-none" />

          {heroImage ? (
            <img
              src={heroImage}
              alt={ad.subject ?? ''}
              className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-700 ease-out"
              loading="lazy"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-text-dim text-sm">
              {t('common.noImage')}
            </div>
          )}

          {/* Gradient: only bottom third, more subtle */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

          {/* Sold ribbon */}
          {isSold && (
            <div className="absolute top-0 right-0 z-20 overflow-hidden w-24 h-24 pointer-events-none">
              <div className="absolute top-4 right-[-28px] w-28 bg-red-500 text-white text-[10px] font-bold tracking-widest text-center py-1 rotate-45 shadow-lg uppercase">
                {t('common.sold')}
              </div>
            </div>
          )}

          <div className="absolute bottom-0 left-0 right-0 px-4 py-3 flex items-end justify-between z-10">
            <span className="text-xl font-semibold text-white drop-shadow-lg font-fraunces">
              {formatPrice(ad.price)}
            </span>
            {deal && !isSold && (
              <Badge className={`${deal.className} flex items-center gap-1`}>
                {deal.icon === 'sparkle' ? (
                  <Sparkles className="h-3 w-3 shrink-0" />
                ) : (
                  <TriangleAlert className="h-3 w-3 shrink-0" />
                )}
                {deal.label}
              </Badge>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col gap-3">
          <h3 className="text-[15px] font-medium text-text-primary line-clamp-1 group-hover:text-accent-text transition-colors leading-snug">
            {ad.subject ?? t('common.noTitle')}
          </h3>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={variantColor(ad.color)}>
              {ad.color ?? t('common.na')}
            </Badge>
            {ad.wheel_type && (
              <Badge className="bg-tint/[0.06] text-text-secondary text-[10px]">
                {ad.wheel_type === 'tubeless' ? 'TL' : 'Tube'}
              </Badge>
            )}
            {accCount > 0 && (
              <Badge className="bg-emerald-500/10 text-ui-emerald ring-1 ring-emerald-500/20 flex items-center gap-1">
                <Wrench className="h-3 w-3 shrink-0" />
                {accCount} acc.
              </Badge>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-text-muted">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {ad.city ?? '?'}
            </span>
            {ad.first_publication_date && (
              <span className="flex items-center gap-1.5 text-text-dim">
                <Calendar className="h-3 w-3 shrink-0" />
                {formatDate(ad.first_publication_date)}
              </span>
            )}
          </div>

          {/* Kilometrage avec jauge integree */}
          {ad.mileage_km != null && (() => {
            const ratio = Math.min(ad.mileage_km / 50000, 1)
            const kmColor = ratio < 0.3
              ? 'from-emerald-500/80 to-emerald-400/60'
              : ratio < 0.6
                ? 'from-amber-500/80 to-amber-400/60'
                : 'from-red-500/80 to-red-400/60'
            const textColor = ratio < 0.3
              ? 'text-ui-emerald'
              : ratio < 0.6
                ? 'text-accent-text'
                : 'text-ui-red'
            return (
              <div className="flex items-center gap-2" style={{ minHeight: '20px' }}>
                <CircleGauge className="h-4 w-4 shrink-0 text-text-muted" style={{ overflow: 'visible' }} />
                <div className="flex-1 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-text-muted">{t('adCard.mileage')}</span>
                    <span className={`text-[11px] tabular-nums font-medium ${textColor}`}>
                      {formatKm(ad.mileage_km)}
                      <span className="text-text-dim font-normal"> / 50 000 km</span>
                    </span>
                  </div>
                  <div style={{ height: '3px', background: 'rgb(from var(--color-tint) r g b / 0.06)', borderRadius: '9999px', overflow: 'hidden' }}>
                    <motion.div
                      className={`bg-gradient-to-r ${kmColor}`}
                      style={{ height: '100%', borderRadius: '9999px' }}
                      initial={{ width: 0 }}
                      animate={{ width: `${ratio * 100}%` }}
                      transition={{ duration: 0.8, delay: index * 0.04 + 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
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
