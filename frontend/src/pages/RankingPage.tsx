import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, AlertTriangle, ExternalLink, Search, X, Wifi, Car } from 'lucide-react'
import { useRankings, useCheckAdsOnline } from '../hooks/queries'
import { useToast } from '../components/Toast'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Select } from '../components/ui/Select'
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
    return <span className={cn(base, 'bg-white/[0.06] animate-pulse')}>&nbsp;</span>
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
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden"
    >
      <div className="px-5 pb-5 pt-3 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        {/* Accessories */}
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-4">
          <h4 className="text-[10px] text-text-muted uppercase tracking-widest font-semibold mb-3">
            {t('ranking.accessories')} ({r.acc_count}) — <span className="text-emerald-400">{formatPrice(r.acc_used_total)}</span>
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
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-4">
          <h4 className="text-[10px] text-text-muted uppercase tracking-widest font-semibold mb-3">
            {t('ranking.consumables')} — <span className="text-orange-400">+{formatPrice(r.wear_total)}</span>
          </h4>
          <ul className="space-y-1.5">
            {r.wear_details.map((c) => (
              <li key={c.name} className={cn('flex justify-between', c.short_term ? 'text-red-400' : 'text-text-secondary')}>
                <span>{c.name} <span className="text-text-dim">({c.wear_pct}%)</span></span>
                <span className="ml-2 shrink-0">{c.cost_consumed} &euro;</span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-text-dim mt-3 pt-2 border-t border-white/[0.04]">
            {t('ranking.mechanical')} : +{formatPrice(r.mechanical_wear)} · {t('ranking.conditionRisk')} : +{formatPrice(r.condition_risk)} ({r.km} km)
          </p>
        </div>

        {/* Warranty & alerts */}
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-4">
          <h4 className="text-[10px] text-text-muted uppercase tracking-widest font-semibold mb-3">
            {t('ranking.warranty')} — {r.warranty.remaining_years} {t('ranking.years')} — <span className="text-blue-400">{formatPrice(r.warranty.value)}</span>
          </h4>
          {r.warranty.circulation_date && (
            <p className="text-text-muted text-xs mb-3">
              {r.warranty.circulation_date} → {r.warranty.expiry_date}
            </p>
          )}

          {r.short_term_items.length > 0 && (
            <div className="mt-2 p-3 rounded-lg bg-red-500/5 border border-red-500/15">
              <div className="flex items-center gap-1.5 text-red-400 text-[11px] font-semibold mb-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t('ranking.shortTerm')} {formatPrice(r.short_term_total)}
              </div>
              {r.short_term_items.map((s) => (
                <p key={s.name} className="text-[11px] text-red-300/70">
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

          <div className="mt-3 pt-2 border-t border-white/[0.04] flex gap-3">
            <Link to={`/ads/${r.id}`} className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
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

function RankingCard({ r, rank, isOpen, onToggle, travel, travelLoading }: {
  r: Ranking; rank: number; isOpen: boolean; onToggle: () => void; travel?: TravelInfo; travelLoading?: boolean
}) {
  const { t } = useTranslation()
  const { formatPrice, formatKm } = useFormatters()
  const colorStr = `${r.color || r.variant}${r.wheel_type === 'tubeless' ? ' TL' : ''}`

  return (
    <Card className={cn('overflow-hidden', r.sold && 'opacity-50')}>
      <button onClick={onToggle} className="w-full text-left p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-text-muted font-fraunces">#{rank}</span>
            <div>
              <p className="text-sm font-medium text-text-primary flex items-center gap-2 flex-wrap">
                {r.city}
                <TravelBadge travel={travel} loading={travelLoading} />
                {r.sold && <span className="text-[10px] text-red-400 uppercase font-semibold">{t('common.sold')}</span>}
              </p>
              <Badge className={variantColor(r.variant)}>{colorStr}</Badge>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-text-primary tabular-nums">{formatPrice(r.effective_price)}</p>
            <span className={cn('text-xs font-semibold', r.decote_pct > 20 ? 'text-emerald-400' : r.decote_pct > 10 ? 'text-amber-400' : 'text-red-400')}>
              -{r.decote_pct}%
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-text-muted border-t border-white/[0.04] pt-3">
          <div className="flex gap-4">
            <span>{t('ranking.listed')} : <span className="text-text-primary font-medium">{formatPrice(r.price)}</span></span>
            <span>{formatKm(r.km)}</span>
          </div>
          <div className="flex items-center gap-3 tabular-nums">
            {r.acc_used_total > 0 && <span className="text-emerald-400">-{r.acc_used_total}</span>}
            <span className="text-orange-400/80">+{r.wear_total}</span>
            <ChevronDown className={cn('h-4 w-4 text-text-dim transition-transform duration-200', isOpen && 'rotate-180')} />
          </div>
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
  const { data: rankings, isLoading } = useRankings()
  const checkOnlineMut = useCheckAdsOnline()
  const { toast } = useToast()
  const [expanded, setExpanded] = useState<number | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('rank')
  const [sortAsc, setSortAsc] = useState(true)

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

  if (isLoading) return <TableSkeleton rows={10} />
  if (!rankings?.length) return <EmptyState title={t('ranking.emptyTitle')} description={t('ranking.emptyDescription')} />

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

  const filtered = useMemo(() => rankings.filter((r) => {
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
  }), [rankings, search, filterColors, filterWheel, maxKm, maxPrice, maxTrajet, travelMap])

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

  const hasLocation = userLoc != null
  const colSpan = hasLocation ? 9 : 8

  const SortHeader = ({ k, children, className: cls }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th
      className={cn('py-4 pr-4 cursor-pointer hover:text-text-secondary select-none whitespace-nowrap transition-colors', cls)}
      onClick={() => handleSort(k)}
    >
      {children}
      {sortKey === k && <span className="ml-0.5 text-amber-400">{sortAsc ? '\u25b2' : '\u25bc'}</span>}
    </th>
  )

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-fraunces">{t('ranking.title')}</h1>
          <p className="text-xs text-text-dim mt-1.5 max-w-2xl">
            {t('ranking.description')}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="gap-1.5 shrink-0"
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
      </div>

      {/* Location picker */}
      <LocationPicker location={userLoc} onChange={handleLocationChange} />

      {/* Filtres */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-dim" />
          <input
            type="text"
            placeholder={t('ranking.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl bg-white/[0.04] border border-white/[0.06] pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder-text-dim focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/30 transition-all"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          {availableColors.map((c) => (
            <button
              key={c}
              onClick={() => toggleColor(c)}
              className={cn(
                'rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-all cursor-pointer',
                filterColors.has(c)
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-white/[0.03] border-white/[0.06] text-text-dim hover:text-text-secondary hover:bg-white/[0.06]',
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <Select
          value={filterWheel}
          onChange={setFilterWheel}
          options={[
            { value: '', label: t('ranking.allWheels') },
            { value: 'rayons', label: t('ranking.spoked') },
            { value: 'tubeless', label: t('ranking.tubeless') },
          ]}
          className="w-full sm:w-auto sm:min-w-[140px]"
        />
        <input
          type="number"
          placeholder={t('ranking.maxKm')}
          value={maxKm}
          onChange={(e) => setMaxKm(e.target.value)}
          className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 py-2.5 text-sm text-text-primary placeholder-text-dim focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all w-full sm:w-[110px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <input
          type="number"
          placeholder={t('ranking.maxPrice')}
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
          className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 py-2.5 text-sm text-text-primary placeholder-text-dim focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all w-full sm:w-[110px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {hasLocation && (
          <div className="flex gap-1.5 items-center">
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
                  'rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-all cursor-pointer',
                  maxTrajet === p.value
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    : 'bg-white/[0.03] border-white/[0.06] text-text-dim hover:text-text-secondary hover:bg-white/[0.06]',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 py-2.5 text-sm text-text-dim hover:text-text-secondary hover:bg-white/[0.06] transition-all flex items-center gap-1.5"
          >
            <X className="h-3.5 w-3.5" /> {t('common.clear')}
          </button>
        )}
      </div>

      {filtered.length < rankings.length && (
        <p className="text-xs text-text-dim">
          {filtered.length} / {rankings.length} {t('ranking.ad', { count: rankings.length })}
        </p>
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
            />
          )
        })}
      </div>

      {/* Desktop: table layout */}
      <Card className="overflow-x-auto hidden lg:block">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="text-left text-[11px] text-text-dim uppercase tracking-widest border-b border-white/[0.06]">
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
              const colorStr = `${r.color || r.variant}${r.wheel_type === 'tubeless' ? ' TL' : ''}`

              return (
                <React.Fragment key={r.id}>
                  <tr
                    className={cn(
                      'border-b border-white/[0.04] cursor-pointer transition-all duration-200',
                      isOpen ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]',
                      r.sold && 'opacity-50',
                    )}
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                  >
                    <td className="py-3 pl-5 pr-4 w-12 text-center font-bold text-text-muted font-fraunces">{origRank}</td>
                    <td className="py-3 pr-4 text-text-secondary">
                      {r.city}
                      {r.sold && <span className="ml-2 text-[10px] text-red-400 uppercase font-semibold">{t('common.sold')}</span>}
                    </td>
                    {hasLocation && (
                      <td className="py-3 pr-4 text-right w-20">
                        <TravelBadge travel={travelMap.get(r.id)} loading={travelLoading} />
                      </td>
                    )}
                    <td className="py-3 pr-4">
                      <Badge className={variantColor(r.variant)}>{colorStr}</Badge>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-text-secondary">{formatKm(r.km)}</td>
                    <td className="py-3 pr-4 text-right tabular-nums text-text-primary">{formatPrice(r.price)}</td>
                    <td className="py-3 pr-4 text-right text-emerald-400 tabular-nums">
                      {r.acc_used_total > 0 ? `-${r.acc_used_total}` : '0'}
                    </td>
                    <td className="py-3 pr-4 text-right font-semibold tabular-nums text-text-primary">{formatPrice(r.effective_price)}</td>
                    <td className="py-3 pr-5 text-right tabular-nums">
                      <span className={cn('font-semibold', r.decote_pct > 20 ? 'text-emerald-400' : r.decote_pct > 10 ? 'text-amber-400' : 'text-red-400')}>
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
