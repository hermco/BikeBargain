import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { X, Wifi } from 'lucide-react'
import { useAds, useCheckAdsOnline } from '../hooks/queries'
import { AdCard } from '../components/AdCard'
import { AdForm } from '../components/AdForm'
import { FilterBar, type SortOption } from '../components/FilterBar'
import { EmptyState } from '../components/EmptyState'
import { CardSkeleton } from '../components/LoadingSkeleton'
import { Button } from '../components/ui/Button'
import { useToast } from '../components/Toast'
import { useCurrentModel } from '../hooks/useCurrentModel'
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

  useEffect(() => {
    if (searchParams.get('add') === 'true') {
      setAutoOpenAdd(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const filtered = useMemo(() => {
    if (!data?.ads) return []
    let ads = data.ads
    if (variant) ads = ads.filter((a) => a.variant === variant)
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

  function clearFilters() {
    setVariant('')
    setSearch('')
    setSort('recent')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
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
              className="flex items-center gap-1.5 rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 py-2 text-xs text-text-dim hover:text-text-secondary hover:bg-white/[0.06] transition-all"
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
            <Wifi className={`h-3.5 w-3.5 ${checkOnlineMut.isPending ? 'animate-pulse' : ''}`} />
            <span className="hidden sm:inline">{checkOnlineMut.isPending ? t('common.checking') : t('common.checkOnline')}</span>
          </Button>
          <AdForm autoOpen={autoOpenAdd} onAutoOpened={() => setAutoOpenAdd(false)} />
        </div>
      </div>

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
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
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
    </div>
  )
}
