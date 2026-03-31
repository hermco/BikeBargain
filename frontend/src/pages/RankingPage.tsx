import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, AlertTriangle, ExternalLink, Search, X, ScanSearch, Car } from 'lucide-react'
import { useRankings, useCheckAdsOnline, useCheckAdsOnlineFull } from '../hooks/queries'
import { useCurrentModel } from '../hooks/useCurrentModel'
import { useToast } from '../components/Toast'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { TableSkeleton } from '../components/LoadingSkeleton'
import { EmptyState } from '../components/EmptyState'
import { LocationPicker } from '../components/LocationPicker'
import { variantColor, cn } from '../lib/utils'
import { useFormatters } from '../hooks/useFormatters'
import {
  getUserLocation, setUserLocation, clearUserLocation,
  haversineKm, travelTimeBand, DISTANCE_BAND_CONFIG,
  fetchTravelTimes, formatDuration,
  type UserLocation, type TravelInfo,
} from '../lib/geo'
import type { Ranking } from '../types'

// ─── Travel badge ─────────────────────────────────────────────────────────────

function TravelBadge({ travel, loading }: { travel?: TravelInfo; loading?: boolean }) {
  const base = 'inline-flex items-center justify-center rounded-lg px-2 py-0.5 min-w-[3.5rem] text-center text-[11px] leading-[16px]'
  if (loading && !travel) {
    return <span className={cn(base, 'bg-tint/[0.06] animate-pulse')}>&nbsp;</span>
  }
  if (!travel) return null
  const band = travelTimeBand(travel.durationSec)
  const cfg = DISTANCE_BAND_CONFIG[band]
  return (
    <span className={cn(base, 'font-semibold tabular-nums', cfg.bg, cfg.color)}>
      {formatDuration(travel.durationSec)}
    </span>
  )
}

// ─── Ranking detail (expanded row) ───────────────────────────────────────────

function RankingDetail({ r, travel }: { r: Ranking; travel?: TravelInfo }) {
  const { t } = useTranslation()
  const { formatPrice } = useFormatters()
  const { modelUrl } = useCurrentModel()
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden"
    >
      <div className="px-5 pb-5 pt-3 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        {/* Accessories */}
        <div className="rounded-xl bg-tint/[0.02] border border-tint/[0.04] p-4">
          <h4 className="text-[10px] text-text-muted uppercase tracking-widest font-semibold mb-3">
            {t('ranking.accessories')} ({r.acc_count}) — <span className="text-ui-emerald">{formatPrice(r.acc_used_total)}</span>
          </h4>
          {r.accessories.length > 0 ? (
            <ul className="space-y-1.5">
              {r.accessories.map((a) => (
                <li key={a.name} className="flex justify-between text-text-secondary">
                  <span className="truncate">{a.name}</span>
                  <span className="text-text-dim ml-2 shrink-0">{a.estimated_used_price} &euro;</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-text-dim">{t('common.none')}</p>
          )}
        </div>

        {/* Consumables */}
        <div className="rounded-xl bg-tint/[0.02] border border-tint/[0.04] p-4">
          <h4 className="text-[10px] text-text-muted uppercase tracking-widest font-semibold mb-3">
            {t('ranking.consumables')} — <span className="text-ui-orange">+{formatPrice(r.wear_total)}</span>
          </h4>
          <ul className="space-y-1.5">
            {r.wear_details.map((c) => (
              <li key={c.name} className={cn('flex justify-between', c.short_term ? 'text-ui-red' : 'text-text-secondary')}>
                <span>{c.name} <span className="text-text-dim">({c.wear_pct}%)</span></span>
                <span className="ml-2 shrink-0">{c.cost_consumed} &euro;</span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-text-dim mt-3 pt-2 border-t border-tint/[0.04]">
            {t('ranking.mechanical')} : +{formatPrice(r.mechanical_wear)} · {t('ranking.conditionRisk')} : +{formatPrice(r.condition_risk)} ({r.km} km)
          </p>
        </div>

        {/* Warranty & alerts */}
        <div className="rounded-xl bg-tint/[0.02] border border-tint/[0.04] p-4">
          <h4 className="text-[10px] text-text-muted uppercase tracking-widest font-semibold mb-3">
            {t('ranking.warranty')} — {r.warranty.remaining_years} {t('ranking.years')} — <span className="text-ui-blue">{formatPrice(r.warranty.value)}</span>
          </h4>
          {r.warranty.circulation_date && (
            <p className="text-text-muted text-xs mb-3">
              {r.warranty.circulation_date} → {r.warranty.expiry_date}
            </p>
          )}

          {r.short_term_items.length > 0 && (
            <div className="mt-2 p-3 rounded-lg bg-red-500/5 border border-red-500/15">
              <div className="flex items-center gap-1.5 text-ui-red text-[11px] font-semibold mb-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t('ranking.shortTerm')} {formatPrice(r.short_term_total)}
              </div>
              {r.short_term_items.map((s) => (
                <p key={s.name} className="text-[11px] text-ui-red/70">
                  {s.name} : {s.garage_cost} &euro; — {s.reason}
                </p>
              ))}
            </div>
          )}

          {travel && (
            <p className="text-[11px] text-text-dim mt-2 flex items-center gap-1">
              <Car className="h-3 w-3" />
              {formatDuration(travel.durationSec)} · {Math.round(travel.distanceKm)} km {t('ranking.byRoad')}
            </p>
          )}

          <div className="mt-3 pt-2 border-t border-tint/[0.04] flex gap-3">
            <Link to={modelUrl(`/ads/${r.id}`)} className="text-xs text-accent-text hover:text-accent-text transition-colors">
              {t('ranking.viewAd')}
            </Link>
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-xs text-text-dim hover:text-text-secondary flex items-center gap-0.5 transition-colors">
              <ExternalLink className="h-3 w-3" /> LBC
            </a>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Mobile card ─────────────────────────────────────────────────────────────

function RankingCard({ r, rank, isOpen, onToggle, travel, travelLoading, hasFilters: filtered }: {
  r: Ranking; rank: number; isOpen: boolean; onToggle: () => void; travel?: TravelInfo; travelLoading?: boolean; hasFilters?: boolean
}) {
  const { t } = useTranslation()
  const { formatPrice, formatKm } = useFormatters()
  const colorStr = `${r.color || '?'}${r.wheel_type === 'tubeless' ? ' TL' : ''}`
  const isPodium = !filtered && r.listing_status === 'online' && rank <= 3
  const podiumBorder = isPodium && rank === 1
    ? 'border-l-2 border-l-amber-400/60'
    : isPodium && rank === 2
      ? 'border-l-2 border-l-gray-300/40'
      : isPodium && rank === 3
        ? 'border-l-2 border-l-amber-700/40'
        : ''

  return (
    <Card className={cn('overflow-hidden', r.listing_status === 'sold' ? 'opacity-50 !border-red-500/25 bg-red-950/15' : r.listing_status === 'paused' ? 'opacity-70 !border-amber-500/25 bg-amber-950/15' : podiumBorder)}>
      <button onClick={onToggle} className="w-full text-left p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={cn('text-lg font-bold font-fraunces', r.listing_status === 'sold' ? 'text-ui-red/60' : r.listing_status === 'paused' ? 'text-amber-400/60' : 'text-text-muted')}>#{rank}</span>
            <div>
              <p className="text-sm font-medium text-text-primary flex items-center gap-2 flex-wrap">
                {r.city}
                <TravelBadge travel={travel} loading={travelLoading} />
                {r.listing_status === 'sold' && <span className="text-[10px] text-red-100 uppercase font-bold bg-red-500/30 border border-red-500/40 px-2 py-0.5 rounded-md tracking-wider shadow-sm shadow-red-500/10">{t('common.sold')}</span>}
                {r.listing_status === 'paused' && <span className="text-[10px] text-amber-100 uppercase font-bold bg-amber-500/30 border border-amber-500/40 px-2 py-0.5 rounded-md tracking-wider shadow-sm shadow-amber-500/10">{t('common.paused')}</span>}
              </p>
              <Badge className={variantColor(r.color)}>{colorStr}</Badge>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-text-primary tabular-nums">{formatPrice(r.effective_price)}</p>
            <span className={cn('text-xs font-semibold', r.decote_pct > 20 ? 'text-ui-emerald' : r.decote_pct > 10 ? 'text-accent-text' : 'text-ui-red')}>
              -{r.decote_pct}%
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-text-muted border-t border-tint/[0.04] pt-3">
          <div className="flex gap-4">
            <span>{t('ranking.listed')} : <span className="text-text-primary font-medium">{formatPrice(r.price)}</span></span>
            <span>{formatKm(r.km)}</span>
          </div>
          <div className="flex items-center gap-3 tabular-nums">
            {r.acc_used_total > 0 && <span className="text-ui-emerald">-{r.acc_used_total}</span>}
            <span className="text-ui-orange/80">+{r.wear_total}</span>
            <ChevronDown className={cn('h-4 w-4 text-text-dim transition-transform duration-200', isOpen && 'rotate-180')} />
          </div>
        </div>

        {/* Décote progress bar */}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-[10px] text-text-dim">{t('ranking.discount')}</span>
          <div className="flex-1 h-1 rounded-full bg-tint/[0.06] overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                r.decote_pct > 20 ? 'bg-emerald-400/70' : r.decote_pct > 10 ? 'bg-amber-400/70' : 'bg-red-400/70',
              )}
              style={{ width: `${Math.min(r.decote_pct, 40) / 40 * 100}%` }}
            />
          </div>
          <span className={cn('text-[10px] font-semibold tabular-nums', r.decote_pct > 20 ? 'text-ui-emerald' : r.decote_pct > 10 ? 'text-accent-text' : 'text-ui-red')}>
            -{r.decote_pct}%
          </span>
        </div>
      </button>

      <AnimatePresence>
        {isOpen && <RankingDetail r={r} travel={travel} />}
      </AnimatePresence>
    </Card>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

type SortKey = 'rank' | 'price' | 'km' | 'effective_price' | 'decote_pct' | 'acc_used_total' | 'distance'

export function RankingPage() {
  const { t } = useTranslation()
  const { formatPrice, formatKm } = useFormatters()
  const { slug, modelUrl } = useCurrentModel()
  const { data: rankings, isLoading } = useRankings(slug)
  const checkOnlineMut = useCheckAdsOnline(slug)
  const checkFullMut = useCheckAdsOnlineFull(slug)
  const { toast } = useToast()
  const [newlySoldIds, setNewlySoldIds] = useState<Set<number>>(new Set())
  const [expanded, setExpanded] = useState<number | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('rank')
  const [sortAsc, setSortAsc] = useState(true)

  const [hideFilter, setHideFilter] = useState<'none' | 'sold' | 'offline'>('none')

  // Filtres
  const [search, setSearch] = useState('')
  const [filterColors, setFilterColors] = useState<Set<string>>(new Set())
  const [filterWheel, setFilterWheel] = useState('')
  const [maxKm, setMaxKm] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [maxTrajet, setMaxTrajet] = useState('')

  // Localisation utilisateur
  const [userLoc, setUserLoc] = useState<UserLocation | null>(() => getUserLocation())

  const handleLocationChange = useCallback((loc: UserLocation | null) => {
    setUserLoc(loc)
    setTravelMap(new Map())
    setTravelLoading(!!loc)
    if (loc) setUserLocation(loc)
    else clearUserLocation()
  }, [])

  // Calcul des distances
  const distanceMap = useMemo(() => {
    if (!userLoc || !rankings) return new Map<number, number>()
    const m = new Map<number, number>()
    for (const r of rankings) {
      if (r.lat != null && r.lng != null) {
        m.set(r.id, haversineKm(userLoc.lat, userLoc.lng, r.lat, r.lng))
      }
    }
    return m
  }, [userLoc, rankings])

  // Temps de trajet (OSRM)
  const [travelMap, setTravelMap] = useState<Map<number, TravelInfo>>(new Map())
  const [travelLoading, setTravelLoading] = useState(false)

  useEffect(() => {
    if (!userLoc || !rankings) {
      setTravelMap(new Map())
      return
    }
    let cancelled = false
    const dests = rankings
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) => ({ id: r.id, lat: r.lat!, lng: r.lng! }))

    setTravelMap(new Map())
    setTravelLoading(true)
    fetchTravelTimes(userLoc, dests)
      .then((m) => { if (!cancelled) setTravelMap(m) })
      .finally(() => { if (!cancelled) setTravelLoading(false) })
    return () => { cancelled = true }
  }, [userLoc, rankings])

  const availableColors = useMemo(
    () => rankings ? [...new Set(rankings.map((r) => r.color).filter(Boolean))].sort() : [],
    [rankings],
  )

  const statusCounts = useMemo(() => {
    const list = rankings ?? []
    return {
      sold: list.filter((r) => r.listing_status === 'sold').length,
      paused: list.filter((r) => r.listing_status === 'paused').length,
    }
  }, [rankings])

  const hasFilters = search || filterColors.size > 0 || filterWheel || maxKm || maxPrice || maxTrajet

  function toggleColor(color: string) {
    setFilterColors((prev) => {
      const next = new Set(prev)
      if (next.has(color)) next.delete(color)
      else next.add(color)
      return next
    })
  }

  // Pre-compute rank map for O(1) lookups instead of O(n) indexOf
  const rankMap = useMemo(() => {
    const map = new Map<number, number>()
    rankings?.forEach((r, i) => map.set(r.id, i))
    return map
  }, [rankings])

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(key === 'price' || key === 'km' || key === 'distance')
    }
  }

  function clearFilters() {
    setSearch('')
    setFilterColors(new Set())
    setFilterWheel('')
    setMaxKm('')
    setMaxPrice('')
    setMaxTrajet('')
  }

  const filtered = useMemo(() => (rankings ?? []).filter((r) => {
    if (hideFilter === 'sold' && r.listing_status === 'sold') return false
    if (hideFilter === 'offline' && r.listing_status !== 'online') return false
    if (search) {
      const q = search.toLowerCase()
      if (!r.city.toLowerCase().includes(q) && !r.color?.toLowerCase().includes(q) && !r.variant.toLowerCase().includes(q)) return false
    }
    if (filterColors.size > 0 && !filterColors.has(r.color)) return false
    if (filterWheel && r.wheel_type !== filterWheel) return false
    if (maxKm && r.km > Number(maxKm)) return false
    if (maxPrice && r.price > Number(maxPrice)) return false
    if (maxTrajet) {
      const t = travelMap.get(r.id)
      if (t == null || t.durationSec > Number(maxTrajet) * 60) return false
    }
    return true
  }), [rankings, search, filterColors, filterWheel, maxKm, maxPrice, maxTrajet, hideFilter, travelMap])

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const aIdx = rankMap.get(a.id) ?? 0
    const bIdx = rankMap.get(b.id) ?? 0
    let cmp = 0
    switch (sortKey) {
      case 'rank': cmp = aIdx - bIdx; break
      case 'price': cmp = a.price - b.price; break
      case 'km': cmp = a.km - b.km; break
      case 'effective_price': cmp = a.effective_price - b.effective_price; break
      case 'decote_pct': cmp = a.decote_pct - b.decote_pct; break
      case 'acc_used_total': cmp = a.acc_used_total - b.acc_used_total; break
      case 'distance': {
        const da = travelMap.get(a.id)?.durationSec ?? (distanceMap.get(a.id) ?? 99999) * 60
        const db = travelMap.get(b.id)?.durationSec ?? (distanceMap.get(b.id) ?? 99999) * 60
        cmp = da - db
        break
      }
    }
    return sortAsc ? cmp : -cmp
  }), [filtered, sortKey, sortAsc, rankMap, travelMap, distanceMap])

  if (isLoading) return <TableSkeleton rows={10} />
  if (!rankings?.length) return <EmptyState icon="trophy" title={t('ranking.emptyTitle')} description={t('ranking.emptyDescription')} />

  const hasLocation = userLoc != null
  const colSpan = hasLocation ? 9 : 8

  const SortHeader = ({ k, children, className: cls }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th
      className={cn('py-4 pr-4 cursor-pointer hover:text-text-secondary select-none whitespace-nowrap transition-colors', cls)}
      onClick={() => handleSort(k)}
    >
      {children}
      {sortKey === k && <span className="ml-0.5 text-accent">{sortAsc ? '\u25b2' : '\u25bc'}</span>}
    </th>
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-fraunces">{t('ranking.title')}</h1>
          <p className="text-xs text-text-dim mt-1.5 max-w-2xl">
            {t('ranking.description')}
          </p>
        </div>
        {/* Quick check */}
        <Button
          variant="secondary"
          size="sm"
          className="gap-1.5 shrink-0"
          disabled={checkOnlineMut.isPending || checkFullMut.isPending}
          onClick={() => {
            checkOnlineMut.mutate(undefined, {
              onSuccess: (data) => {
                const changedIds = data.details.filter((d) => d.changed).map((d) => d.id)
                setNewlySoldIds(new Set(changedIds))
                toast(
                  data.changes > 0
                    ? t('ranking.statusChanges', { count: data.changes })
                    : t('ads.checkedNone', { count: data.checked }),
                  data.changes > 0 ? 'success' : 'info',
                )
              },
              onError: (err) => toast((err as Error).message, 'error'),
            })
          }}
        >
          <ScanSearch className={`h-3.5 w-3.5 ${checkOnlineMut.isPending ? 'animate-pulse' : ''}`} />
          <span className="hidden sm:inline">{checkOnlineMut.isPending ? t('common.checking') : t('ranking.checkQuick')}</span>
        </Button>
        {/* Full check */}
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 shrink-0"
          disabled={checkOnlineMut.isPending || checkFullMut.isPending}
          onClick={() => {
            checkFullMut.mutate(undefined, {
              onSuccess: (data) => {
                const changedIds = data.details.filter((d) => d.changed).map((d) => d.id)
                setNewlySoldIds(new Set(changedIds))
                const parts: string[] = []
                if (data.changes > 0) parts.push(t('ranking.statusChanges', { count: data.changes }))
                if (data.back_online > 0) parts.push(t('ranking.backOnline', { count: data.back_online }))
                if (parts.length === 0) parts.push(t('ads.checkedNone', { count: data.checked }))
                toast(parts.join(' \u00b7 '), data.changes > 0 ? 'success' : 'info')
              },
              onError: (err) => toast((err as Error).message, 'error'),
            })
          }}
        >
          <ScanSearch className={`h-3.5 w-3.5 ${checkFullMut.isPending ? 'animate-pulse' : ''}`} />
          <span className="hidden sm:inline">{checkFullMut.isPending ? t('common.checking') : t('ranking.checkFull')}</span>
        </Button>
      </div>

      {/* Location picker */}
      <LocationPicker location={userLoc} onChange={handleLocationChange} />

      {/* Newly sold banner */}
      <AnimatePresence>
        {newlySoldIds.size > 0 && rankings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-accent-text flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  {t('ranking.newlySoldBanner', { count: newlySoldIds.size })}
                </h3>
                <button
                  onClick={() => setNewlySoldIds(new Set())}
                  className="text-text-dim hover:text-text-secondary transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {rankings
                  .filter((r) => newlySoldIds.has(r.id))
                  .map((r) => {
                    const origRank = (rankMap.get(r.id) ?? 0) + 1
                    return (
                      <Link
                        key={r.id}
                        to={modelUrl(`/ads/${r.id}`)}
                        className="inline-flex items-center gap-2 rounded-lg bg-tint/[0.04] border border-tint/[0.06] px-3 py-2 text-sm hover:bg-tint/[0.08] transition-colors"
                      >
                        <span className="text-text-dim font-fraunces">#{origRank}</span>
                        <span className="text-text-secondary">{r.city}</span>
                        <Badge className={cn(variantColor(r.color), 'text-[10px]')}>{r.color || '?'}</Badge>
                        <span className="text-text-primary font-medium tabular-nums">{formatPrice(r.price)}</span>
                      </Link>
                    )
                  })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Row 1: Search + Hide Sold toggle */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-dim" />
          <input
            type="text"
            placeholder={t('ranking.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl bg-tint/[0.04] border border-tint/[0.06] pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder-text-dim focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/30 transition-all"
          />
        </div>
        <button
          onClick={() => setHideFilter(prev =>
            prev === 'none' ? 'sold' : prev === 'sold' ? 'offline' : 'none'
          )}
          className={cn(
            'flex items-center gap-2.5 rounded-xl border px-4 py-2.5 transition-all cursor-pointer shrink-0',
            hideFilter !== 'none'
              ? 'bg-gradient-to-r from-amber-500/12 to-amber-500/6 border-amber-500/25'
              : 'bg-tint/[0.03] border-tint/[0.06] hover:bg-tint/[0.05]',
          )}
          title={t('ranking.toggleSold')}
        >
          {/* Toggle switch */}
          <div className={cn(
            'relative w-9 h-5 rounded-full transition-colors duration-200',
            hideFilter !== 'none' ? 'bg-amber-500/80' : 'bg-tint/[0.12]',
          )}>
            <div className={cn(
              'absolute top-[2px] w-4 h-4 rounded-full bg-bg shadow-sm transition-all duration-200',
              hideFilter !== 'none' ? 'left-[18px]' : 'left-[2px]',
            )} />
          </div>
          <span className={cn(
            'text-sm font-medium transition-colors',
            hideFilter !== 'none' ? 'text-accent-text' : 'text-text-muted',
          )}>
            {hideFilter === 'none' ? t('ranking.hideSold') :
             hideFilter === 'sold' ? t('ranking.hideOffline') :
             t('common.showAll')}
          </span>
          {(statusCounts.sold > 0 || statusCounts.paused > 0) && (
            <span className={cn(
              'text-[11px] tabular-nums font-semibold px-1.5 py-0.5 rounded-md transition-colors',
              hideFilter !== 'none' ? 'bg-accent-subtle text-accent-text' : 'bg-tint/[0.06] text-text-dim',
            )}>
              {statusCounts.sold + statusCounts.paused}
            </span>
          )}
        </button>
      </div>

      {/* Row 2: Filter groups in card container */}
      <div className="rounded-xl bg-tint/[0.02] border border-tint/[0.05] px-4 py-3">
        <div className="flex flex-wrap gap-x-4 gap-y-3 items-center">

          {/* Color group */}
          {availableColors.length > 0 && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-widest text-text-dim font-semibold mr-1">{t('ranking.color')}</span>
                {availableColors.map((c) => (
                  <button
                    key={c}
                    onClick={() => toggleColor(c)}
                    className={cn(
                      'rounded-lg px-2.5 py-1 text-xs font-medium border transition-all cursor-pointer',
                      filterColors.has(c)
                        ? 'bg-accent-subtle border-amber-500/30 text-accent-text'
                        : 'bg-tint/[0.03] border-tint/[0.06] text-text-dim hover:text-text-secondary hover:bg-tint/[0.06]',
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="w-px h-5 bg-tint/[0.06] hidden sm:block" />
            </>
          )}

          {/* Wheels group */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-widest text-text-dim font-semibold mr-1">{t('ranking.wheels')}</span>
            {[
              { value: '', label: t('ranking.allWheels') },
              { value: 'rayons', label: t('ranking.spoked') },
              { value: 'tubeless', label: t('ranking.tubeless') },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilterWheel(filterWheel === opt.value ? '' : opt.value)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-medium border transition-all cursor-pointer',
                  filterWheel === opt.value
                    ? 'bg-accent-subtle border-amber-500/30 text-accent-text'
                    : 'bg-tint/[0.03] border-tint/[0.06] text-text-dim hover:text-text-secondary hover:bg-tint/[0.06]',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-tint/[0.06] hidden sm:block" />

          {/* Max values group */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-widest text-text-dim font-semibold mr-1">Max</span>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-text-dim pointer-events-none">km</span>
              <input
                type="number"
                placeholder="—"
                value={maxKm}
                onChange={(e) => setMaxKm(e.target.value)}
                className="rounded-lg bg-tint/[0.04] border border-tint/[0.06] pl-8 pr-2.5 py-1 text-xs text-text-primary placeholder-text-dim focus:outline-none focus:ring-1 focus:ring-amber-500/30 transition-all w-[90px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-text-dim pointer-events-none">€</span>
              <input
                type="number"
                placeholder="—"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="rounded-lg bg-tint/[0.04] border border-tint/[0.06] pl-7 pr-2.5 py-1 text-xs text-text-primary placeholder-text-dim focus:outline-none focus:ring-1 focus:ring-amber-500/30 transition-all w-[90px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
          </div>

          {/* Travel time presets (only if location set) */}
          {hasLocation && (
            <>
              <div className="w-px h-5 bg-tint/[0.06] hidden sm:block" />
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-widest text-text-dim font-semibold mr-1">{t('ranking.travel')}</span>
                {[
                  { label: '< 1h', value: '60' },
                  { label: '< 2h', value: '120' },
                  { label: '< 3h', value: '180' },
                  { label: '< 5h', value: '300' },
                ].map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setMaxTrajet(maxTrajet === p.value ? '' : p.value)}
                    className={cn(
                      'rounded-lg px-2.5 py-1 text-xs font-medium border transition-all cursor-pointer',
                      maxTrajet === p.value
                        ? 'bg-accent-subtle border-amber-500/30 text-accent-text'
                        : 'bg-tint/[0.03] border-tint/[0.06] text-text-dim hover:text-text-secondary hover:bg-tint/[0.06]',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Spacer + clear */}
          {hasFilters && (
            <>
              <div className="flex-1" />
              <button
                onClick={clearFilters}
                className="text-xs text-text-dim hover:text-text-secondary transition-colors flex items-center gap-1"
              >
                <X className="h-3 w-3" /> {t('common.clear')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Row 3: Active filter chips + result count */}
      {(hasFilters || filtered.length < rankings.length) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {search && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/8 border border-amber-500/15 px-2.5 py-1 text-[11px] text-accent-text">
              "{search}"
              <button onClick={() => setSearch('')} className="hover:text-amber-100 transition-colors"><X className="h-2.5 w-2.5" /></button>
            </span>
          )}
          {[...filterColors].map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/8 border border-amber-500/15 px-2.5 py-1 text-[11px] text-accent-text">
              {c}
              <button onClick={() => toggleColor(c)} className="hover:text-amber-100 transition-colors"><X className="h-2.5 w-2.5" /></button>
            </span>
          ))}
          {filterWheel && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/8 border border-amber-500/15 px-2.5 py-1 text-[11px] text-accent-text">
              {filterWheel === 'rayons' ? t('ranking.spoked') : t('ranking.tubeless')}
              <button onClick={() => setFilterWheel('')} className="hover:text-amber-100 transition-colors"><X className="h-2.5 w-2.5" /></button>
            </span>
          )}
          {maxKm && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/8 border border-amber-500/15 px-2.5 py-1 text-[11px] text-accent-text">
              ≤ {Number(maxKm).toLocaleString()} km
              <button onClick={() => setMaxKm('')} className="hover:text-amber-100 transition-colors"><X className="h-2.5 w-2.5" /></button>
            </span>
          )}
          {maxPrice && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/8 border border-amber-500/15 px-2.5 py-1 text-[11px] text-accent-text">
              ≤ {Number(maxPrice).toLocaleString()} €
              <button onClick={() => setMaxPrice('')} className="hover:text-amber-100 transition-colors"><X className="h-2.5 w-2.5" /></button>
            </span>
          )}
          {maxTrajet && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/8 border border-amber-500/15 px-2.5 py-1 text-[11px] text-accent-text">
              ≤ {Math.round(Number(maxTrajet) / 60)}h
              <button onClick={() => setMaxTrajet('')} className="hover:text-amber-100 transition-colors"><X className="h-2.5 w-2.5" /></button>
            </span>
          )}
          {filtered.length < rankings.length && (
            <span className="text-[11px] text-text-dim ml-1 tabular-nums">
              {filtered.length} / {rankings.length} {t('ranking.ad', { count: rankings.length })}
            </span>
          )}
        </div>
      )}

      {/* Mobile: card layout */}
      <div className="lg:hidden space-y-3">
        {sorted.map((r) => {
          const origRank = (rankMap.get(r.id) ?? 0) + 1
          return (
            <RankingCard
              key={r.id}
              r={r}
              rank={origRank}
              isOpen={expanded === r.id}
              onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
              travel={travelMap.get(r.id)}
              travelLoading={travelLoading}
              hasFilters={!!hasFilters}
            />
          )
        })}
      </div>

      {/* Desktop: table layout */}
      <Card className="overflow-x-auto hidden lg:block">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="text-left text-[11px] text-text-dim uppercase tracking-widest border-b border-tint/[0.06]">
              <SortHeader k="rank" className="pl-5 w-12 text-center">{t('ranking.rank')}</SortHeader>
              <th className="py-4 pr-4">{t('ranking.city')}</th>
              {hasLocation && <SortHeader k="distance" className="text-right w-20">{t('ranking.travel')}</SortHeader>}
              <th className="py-4 pr-4">{t('ranking.color')}</th>
              <SortHeader k="km" className="text-right">{t('ranking.km')}</SortHeader>
              <SortHeader k="price" className="text-right">{t('ranking.listed')}</SortHeader>
              <SortHeader k="acc_used_total" className="text-right">{t('ranking.acc')}</SortHeader>
              <SortHeader k="effective_price" className="text-right">{t('ranking.effective')}</SortHeader>
              <SortHeader k="decote_pct" className="pr-5 text-right">{t('ranking.discount')}</SortHeader>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const origRank = (rankMap.get(r.id) ?? 0) + 1
              const isOpen = expanded === r.id
              const colorStr = `${r.color || '?'}${r.wheel_type === 'tubeless' ? ' TL' : ''}`

              const isPodium = !hasFilters && r.listing_status === 'online' && origRank <= 3
              const podiumStyle = isPodium && origRank === 1
                ? 'border-l-2 border-l-amber-400/60 bg-amber-500/[0.04]'
                : isPodium && origRank === 2
                  ? 'border-l-2 border-l-gray-300/40 bg-tint/[0.02]'
                  : isPodium && origRank === 3
                    ? 'border-l-2 border-l-amber-700/40 bg-amber-900/[0.03]'
                    : ''

              return (
                <React.Fragment key={r.id}>
                  <tr
                    className={cn(
                      'border-b border-tint/[0.04] cursor-pointer transition-all duration-200 group/row',
                      isOpen ? 'bg-tint/[0.04]' : 'hover:bg-tint/[0.03]',
                      r.listing_status === 'sold' ? 'opacity-50 bg-red-950/20 border-l-2 !border-l-red-500/40' : r.listing_status === 'paused' ? 'opacity-70 bg-amber-950/20 border-l-2 !border-l-amber-500/40' : podiumStyle,
                    )}
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                  >
                    <td className={cn(
                      'py-3 pl-5 pr-4 w-12 text-center font-bold font-fraunces',
                      r.listing_status === 'sold' ? 'text-ui-red/60' :
                      r.listing_status === 'paused' ? 'text-amber-400/60' :
                      isPodium && origRank === 1 ? 'text-accent-text' :
                      isPodium && origRank === 2 ? 'text-gray-300' :
                      isPodium && origRank === 3 ? 'text-amber-600' : 'text-text-muted',
                    )}>{origRank}</td>
                    <td className="py-3 pr-4 text-text-secondary">
                      {r.city}
                      {r.listing_status === 'sold' && <span className="ml-2 text-[10px] text-red-100 uppercase font-bold bg-red-500/30 border border-red-500/40 px-2 py-0.5 rounded-md tracking-wider shadow-sm shadow-red-500/10">{t('common.sold')}</span>}
                      {r.listing_status === 'paused' && <span className="ml-2 text-[10px] text-amber-100 uppercase font-bold bg-amber-500/30 border border-amber-500/40 px-2 py-0.5 rounded-md tracking-wider shadow-sm shadow-amber-500/10">{t('common.paused')}</span>}
                    </td>
                    {hasLocation && (
                      <td className="py-3 pr-4 text-right w-20">
                        <TravelBadge travel={travelMap.get(r.id)} loading={travelLoading} />
                      </td>
                    )}
                    <td className="py-3 pr-4">
                      <Badge className={variantColor(r.color)}>{colorStr}</Badge>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-text-secondary">{formatKm(r.km)}</td>
                    <td className={cn('py-3 pr-4 text-right tabular-nums text-text-primary', r.listing_status === 'sold' && 'line-through decoration-red-400/50')}>{formatPrice(r.price)}</td>
                    <td className="py-3 pr-4 text-right text-ui-emerald tabular-nums">
                      {r.acc_used_total > 0 ? `-${r.acc_used_total}` : '0'}
                    </td>
                    <td className="py-3 pr-4 text-right font-semibold tabular-nums text-text-primary">{formatPrice(r.effective_price)}</td>
                    <td className="py-3 pr-5 text-right tabular-nums">
                      <span className={cn('font-semibold', r.decote_pct > 20 ? 'text-ui-emerald' : r.decote_pct > 10 ? 'text-accent-text' : 'text-ui-red')}>
                        -{r.decote_pct}%
                      </span>
                      <ChevronDown className={cn('inline h-4 w-4 ml-1.5 text-text-dim transition-transform duration-200', isOpen && 'rotate-180')} />
                    </td>
                  </tr>
                  <AnimatePresence>
                    {isOpen && (
                      <tr>
                        <td colSpan={colSpan} className="p-0">
                          <RankingDetail r={r} travel={travelMap.get(r.id)} />
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </Card>
    </motion.div>
  )
}
