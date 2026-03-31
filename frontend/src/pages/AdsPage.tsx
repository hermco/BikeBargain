import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { X, ScanSearch, TrendingUp, Tag, ArrowUpDown } from 'lucide-react'
import { useAds, useCheckAdsOnline } from '../hooks/queries'
import { AdCard } from '../components/AdCard'
import { AdForm } from '../components/AdForm'
import { FilterBar, type SortOption } from '../components/FilterBar'
import { EmptyState } from '../components/EmptyState'
import { CardSkeleton } from '../components/LoadingSkeleton'
import { Button } from '../components/ui/Button'
import { useToast } from '../components/Toast'
import { useCurrentModel } from '../hooks/useCurrentModel'
import { useFormatters } from '../hooks/useFormatters'
import type { Ad } from '../types'

function sortAds(ads: Ad[], sort: SortOption): Ad[] {
  const sorted = [...ads]
  switch (sort) {
    case 'price_asc':
      return sorted.sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
    case 'price_desc':
      return sorted.sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
    case 'km_asc':
      return sorted.sort((a, b) => (a.mileage_km ?? 0) - (b.mileage_km ?? 0))
    case 'km_desc':
      return sorted.sort((a, b) => (b.mileage_km ?? 0) - (a.mileage_km ?? 0))
    case 'recent':
    default:
      return sorted.sort((a, b) => {
        const da = a.first_publication_date ?? a.extracted_at
        const db = b.first_publication_date ?? b.extracted_at
        return db.localeCompare(da)
      })
  }
}

export function AdsPage() {
  const { t } = useTranslation()
  const { slug } = useCurrentModel()
  const [searchParams, setSearchParams] = useSearchParams()
  const [variant, setVariant] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortOption>('recent')
  const [autoOpenAdd, setAutoOpenAdd] = useState(false)
  const { data, isLoading } = useAds(slug)
  const checkOnlineMut = useCheckAdsOnline(slug)
  const { toast } = useToast()
  const { formatPrice } = useFormatters()

  useEffect(() => {
    if (searchParams.get('add') === 'true') {
      setAutoOpenAdd(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const filtered = useMemo(() => {
    if (!data?.ads) return []
    let ads = data.ads
    if (variant) ads = ads.filter((a) => a.color === variant)
    if (search) {
      const q = search.toLowerCase()
      ads = ads.filter(
        (a) =>
          (a.city ?? '').toLowerCase().includes(q) ||
          (a.subject ?? '').toLowerCase().includes(q) ||
          (a.color ?? '').toLowerCase().includes(q) ||
          (a.department ?? '').toLowerCase().includes(q),
      )
    }
    return sortAds(ads, sort)
  }, [data, variant, search, sort])

  const hasFilters = variant || search
  const totalCount = data?.total ?? 0

  const kpiStats = useMemo(() => {
    if (!data?.ads?.length) return null
    const prices = data.ads.map(a => a.price).filter((p): p is number => p != null)
    if (!prices.length) return null
    const avg = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const soldCount = data.ads.filter(a => a.sold).length
    return { avg, min, max, soldCount }
  }, [data])

  function clearFilters() {
    setVariant('')
    setSearch('')
    setSort('recent')
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <motion.div
        className="flex items-center justify-between mb-8"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-fraunces">{t('ads.title')}</h1>
          {data && (
            <p className="text-sm text-text-muted mt-1">
              {hasFilters ? (
                <span>{filtered.length} / {t('ads.ad', { count: totalCount })}</span>
              ) : (
                <span>{t('ads.recorded', { count: totalCount })}</span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 rounded-xl bg-tint/[0.04] border border-tint/[0.06] px-3 py-2 text-xs text-text-dim hover:text-text-secondary hover:bg-tint/[0.06] transition-all"
            >
              <X className="h-3.5 w-3.5" /> {t('common.resetFilters')}
            </button>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5"
            disabled={checkOnlineMut.isPending}
            onClick={() => {
              checkOnlineMut.mutate(undefined, {
                onSuccess: (data) => {
                  toast(
                    data.newly_sold > 0
                      ? t('ads.newlySold', { count: data.newly_sold })
                      : t('ads.checkedNone', { count: data.checked }),
                    data.newly_sold > 0 ? 'success' : 'info',
                  )
                },
                onError: (err) => toast((err as Error).message, 'error'),
              })
            }}
          >
            <ScanSearch className={`h-3.5 w-3.5 ${checkOnlineMut.isPending ? 'animate-pulse' : ''}`} />
            <span className="hidden sm:inline">{checkOnlineMut.isPending ? t('common.checking') : t('common.checkOnline')}</span>
          </Button>
          <AdForm autoOpen={autoOpenAdd} onAutoOpened={() => setAutoOpenAdd(false)} />
        </div>
      </motion.div>

      {/* KPI summary strip */}
      {kpiStats && (
        <motion.div
          className="flex flex-wrap gap-4 mb-6 px-4 py-3 rounded-xl bg-tint/[0.02] border border-tint/[0.04]"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-center gap-2 text-xs">
            <TrendingUp className="h-3.5 w-3.5 text-accent-text/70" />
            <span className="text-text-muted">{t('stats.avgPrice')}</span>
            <span className="text-text-primary font-semibold tabular-nums">{formatPrice(kpiStats.avg)}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <ArrowUpDown className="h-3.5 w-3.5 text-text-dim" />
            <span className="text-text-muted">{t('stats.priceRange')}</span>
            <span className="text-text-secondary tabular-nums">{formatPrice(kpiStats.min)} — {formatPrice(kpiStats.max)}</span>
          </div>
          {kpiStats.soldCount > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <Tag className="h-3.5 w-3.5 text-ui-red/60" />
              <span className="text-text-muted">{t('ads.sold')}</span>
              <span className="text-ui-red/80 tabular-nums">{kpiStats.soldCount}</span>
            </div>
          )}
        </motion.div>
      )}

      <FilterBar
        variant={variant}
        onVariantChange={setVariant}
        search={search}
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} index={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="grid"
          title={t('ads.emptyTitle')}
          description={t('ads.emptyDescription')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((ad, i) => (
            <AdCard key={ad.id} ad={ad} index={i} />
          ))}
        </div>
      )}
    </motion.div>
  )
}
