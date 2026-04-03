import { useState, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { X, TrendingUp, Tag, ArrowUpDown, Loader2 } from 'lucide-react'
import { useInfiniteAds, useRankings, useCheckAdsOnline, useCheckAdsOnlineFull } from '../hooks/queries'
import { AdCard } from '../components/AdCard'
import { AdForm } from '../components/AdForm'
import { FilterBar, type SortOption } from '../components/FilterBar'
import { EmptyState } from '../components/EmptyState'
import { CardSkeleton } from '../components/LoadingSkeleton'
import { CheckOnlineButton } from '../components/ui/CheckOnlineButton'
import { useToast } from '../components/Toast'
import { useCurrentModel } from '../hooks/useCurrentModel'
import { useFormatters } from '../hooks/useFormatters'

export function AdsPage() {
  const { t } = useTranslation()
  const { slug } = useCurrentModel()
  const [searchParams, setSearchParams] = useSearchParams()
  const [variant, setVariant] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortOption>('recent')
  const [autoOpenAdd, setAutoOpenAdd] = useState(false)

  // Debounce search to avoid spamming API on every keystroke
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const queryParams = useMemo(() => ({
    ...(variant ? { variant } : {}),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(sort !== 'recent' ? { sort } : {}),
  }), [variant, debouncedSearch, sort])

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteAds(slug, queryParams)

  const { data: rankings } = useRankings(slug)
  const checkOnlineMut = useCheckAdsOnline(slug)
  const checkFullMut = useCheckAdsOnlineFull(slug)
  const { toast } = useToast()
  const { formatPrice } = useFormatters()

  useEffect(() => {
    if (searchParams.get('add') === 'true') {
      setAutoOpenAdd(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Infinite scroll via IntersectionObserver
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage()
        }
      },
      { rootMargin: '400px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const allAds = useMemo(
    () => data?.pages.flatMap((p) => p.ads) ?? [],
    [data],
  )
  const totalCount = data?.pages[0]?.total ?? 0

  const rankMap = useMemo(() => {
    const map = new Map<number, number>()
    if (rankings) {
      rankings.forEach((r, i) => map.set(r.id, i + 1))
    }
    return map
  }, [rankings])

  const hasFilters = variant || search

  const kpiStats = useMemo(() => {
    if (!totalCount) return null
    // KPI stats are based on first page data — approximate but avoids loading all ads
    const prices = allAds.map(a => a.price).filter((p): p is number => p != null)
    if (!prices.length) return null
    const avg = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const soldCount = allAds.filter(a => a.listing_status === 'sold').length
    const pausedCount = allAds.filter(a => a.listing_status === 'paused').length
    return { avg, min, max, soldCount, pausedCount }
  }, [allAds, totalCount])

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
                <span>{t('ads.ad', { count: totalCount })}</span>
              ) : (
                <span>{t('ads.recorded', { count: totalCount })}</span>
              )}
              {allAds.length < totalCount && (
                <span className="ml-2 text-text-dim">
                  — {t('ads.loaded', { loaded: allAds.length, total: totalCount })}
                </span>
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
          <CheckOnlineButton
            quickLabel={t('ranking.checkQuick')}
            fullLabel={t('ranking.checkFull')}
            checkingLabel={t('common.checking')}
            quickDescription={t('ranking.checkQuickDesc')}
            fullDescription={t('ranking.checkFullDesc')}
            isQuickPending={checkOnlineMut.isPending}
            isFullPending={checkFullMut.isPending}
            onQuickCheck={() => {
              checkOnlineMut.mutate(undefined, {
                onSuccess: (data) => {
                  const changed = data.details.filter((d) => d.changed).length
                  toast(
                    changed > 0
                      ? t('ranking.statusChanges', { count: changed })
                      : t('ads.checkedNone', { count: data.checked }),
                    changed > 0 ? 'success' : 'info',
                  )
                },
                onError: (err) => toast((err as Error).message, 'error'),
              })
            }}
            onFullCheck={() => {
              checkFullMut.mutate(undefined, {
                onSuccess: (data) => {
                  const parts: string[] = []
                  if (data.changes > 0) parts.push(t('ranking.statusChanges', { count: data.changes }))
                  if (data.back_online > 0) parts.push(t('ranking.backOnline', { count: data.back_online }))
                  if (parts.length === 0) parts.push(t('ads.checkedNone', { count: data.checked }))
                  toast(parts.join(' · '), data.changes > 0 ? 'success' : 'info')
                },
                onError: (err) => toast((err as Error).message, 'error'),
              })
            }}
          />
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
          {kpiStats.pausedCount > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-text-muted">{t('ads.paused')}</span>
              <span className="text-amber-700/80 dark:text-amber-400/80 tabular-nums">{kpiStats.pausedCount}</span>
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
      ) : allAds.length === 0 ? (
        <EmptyState
          icon="grid"
          title={t('ads.emptyTitle')}
          description={t('ads.emptyDescription')}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {allAds.map((ad, i) => (
              <AdCard key={ad.id} ad={ad} index={i} rank={rankMap.get(ad.id)} />
            ))}
          </div>

          {/* Sentinel for infinite scroll */}
          <div ref={sentinelRef} className="h-1" />

          {isFetchingNextPage && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-text-dim" />
            </div>
          )}
        </>
      )}
    </motion.div>
  )
}
