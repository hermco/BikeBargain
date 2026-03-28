import { useParams, Link, useNavigate, Navigate } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Trash2, MapPin, Calendar, ChevronLeft, ChevronRight, ChevronDown, Camera, Pencil, X, Check, Plus, RefreshCw, Ban, Wifi, TrendingDown, TrendingUp, History } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useAd, useDeleteAd, useUpdateAd, useAccessoryCatalog, useRefreshAdAccessories, useMarkAdSold, useCheckAdOnline, usePriceHistory } from '../hooks/queries'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { CategoryBadge } from '../components/AccessoryBadge'
import { TableSkeleton } from '../components/LoadingSkeleton'
import { EmptyState } from '../components/EmptyState'
import { useToast } from '../components/Toast'
import { variantColor } from '../lib/utils'
import { useFormatters } from '../hooks/useFormatters'
import { useState, useEffect, useCallback } from 'react'
import * as Accordion from '@radix-ui/react-accordion'
import * as Dialog from '@radix-ui/react-dialog'
import type { Accessory } from '../types'
import { VARIANTS, COLORS, WHEEL_TYPES } from '../lib/constants'

export function AdDetailPage() {
  const { id } = useParams<{ id: string }>()
  const adId = id ? Number(id) : NaN
  const { t } = useTranslation()
  const { formatPrice, formatKm } = useFormatters()
  const { data: ad, isLoading, error } = useAd(adId)
  const deleteMut = useDeleteAd()
  const updateMut = useUpdateAd()
  const refreshAccMut = useRefreshAdAccessories()
  const markSoldMut = useMarkAdSold()
  const checkOnlineMut = useCheckAdOnline()
  const { data: priceHistory } = usePriceHistory(adId)
  const navigate = useNavigate()
  const { toast } = useToast()
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [editColor, setEditColor] = useState<string | null>(null)
  const [editVariant, setEditVariant] = useState<string | null>(null)
  const [editWheelType, setEditWheelType] = useState<string | null>(null)
  const [editAccessories, setEditAccessories] = useState<Accessory[] | null>(null)
  const [showAddAccessory, setShowAddAccessory] = useState(false)
  const [accessorySearch, setAccessorySearch] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const { data: catalog } = useAccessoryCatalog()

  // Keyboard navigation for lightbox
  const handleLightboxKey = useCallback((e: KeyboardEvent) => {
    if (lightboxIdx === null) return
    if (e.key === 'Escape') setLightboxIdx(null)
    if (e.key === 'ArrowLeft') setLightboxIdx((prev) => Math.max(0, (prev ?? 0) - 1))
    if (e.key === 'ArrowRight') setLightboxIdx((prev) => Math.min((ad?.images?.length ?? 1) - 1, (prev ?? 0) + 1))
  }, [lightboxIdx, ad?.images?.length])

  useEffect(() => {
    if (lightboxIdx !== null) {
      document.addEventListener('keydown', handleLightboxKey)
      return () => document.removeEventListener('keydown', handleLightboxKey)
    }
  }, [lightboxIdx, handleLightboxKey])

  if (isNaN(adId)) return <Navigate to="/" replace />
  if (isLoading) return <TableSkeleton rows={12} />
  if (error || !ad)
    return (
      <EmptyState
        title={t('adDetail.notFound')}
        action={
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500/15 text-amber-300 px-4 py-2 text-sm font-medium hover:bg-amber-500/25 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('common.backToListings')}
          </Link>
        }
      />
    )

  function startEdit() {
    setEditing(true)
    setEditColor(ad!.color)
    setEditVariant(ad!.variant)
    setEditWheelType(ad!.wheel_type)
    setEditAccessories([...(ad!.accessories ?? [])])
  }

  function cancelEdit() {
    setEditing(false)
    setEditColor(null)
    setEditVariant(null)
    setEditWheelType(null)
    setEditAccessories(null)
    setShowAddAccessory(false)
    setAccessorySearch('')
  }

  function accessoriesChanged(): boolean {
    if (!editAccessories) return false
    const orig = ad!.accessories ?? []
    if (editAccessories.length !== orig.length) return true
    const origNames = orig.map((a) => a.name).sort()
    const editNames = editAccessories.map((a) => a.name).sort()
    return origNames.some((n, i) => n !== editNames[i])
  }

  function saveEdit() {
    const changes: Record<string, unknown> = { id: ad!.id }
    if (editColor !== ad!.color) changes.color = editColor
    if (editVariant !== ad!.variant) changes.variant = editVariant
    if (editWheelType !== ad!.wheel_type) changes.wheel_type = editWheelType
    if (accessoriesChanged()) changes.accessories = editAccessories

    updateMut.mutate(changes as Parameters<typeof updateMut.mutate>[0], {
      onSuccess: () => {
        toast(t('adDetail.adUpdated'), 'success')
        cancelEdit()
      },
      onError: (err) => {
        toast((err as Error).message, 'error')
      },
    })
  }

  function removeAccessory(index: number) {
    if (!editAccessories) return
    const next = [...editAccessories]
    next.splice(index, 1)
    setEditAccessories(next)
  }

  function addAccessory(acc: { name: string; category: string; estimated_new_price: number; estimated_used_price: number }) {
    if (!editAccessories) return
    if (editAccessories.some((a) => a.name === acc.name)) return
    setEditAccessories([...editAccessories, { ...acc, source: 'manual' }])
    setShowAddAccessory(false)
    setAccessorySearch('')
  }

  function handleDelete() {
    deleteMut.mutate(ad!.id, {
      onSuccess: () => {
        toast(t('adDetail.adDeleted'), 'success')
        navigate('/')
      },
    })
  }

  const currentVariant = editing ? editVariant : ad.variant
  const currentAccessories = editing ? (editAccessories ?? []) : (ad.accessories ?? [])
  const availableColors = currentVariant ? COLORS[currentVariant] ?? [] : Object.values(COLORS).flat()

  const accByCategory = currentAccessories.reduce(
    (acc, a) => {
      const cat = a.category || 'autre'
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(a)
      return acc
    },
    {} as Record<string, Accessory[]>,
  )

  const imageCount = ad.images?.length ?? 0

  // Catalog accessories not yet added
  const catalogFiltered = (catalog ?? []).filter((c) => {
    if (currentAccessories.some((a) => a.name === c.name)) return false
    if (!accessorySearch) return true
    const q = accessorySearch.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
  })

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <Link to="/" className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-white/[0.08] transition-all shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight line-clamp-1 font-fraunces">
              {ad.subject ?? t('common.noTitle')}
            </h1>
            <p className="text-sm text-text-muted mt-0.5">{ad.city ?? '?'} — {ad.variant ?? t('common.na')}</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={cancelEdit} className="gap-1.5">
                <X className="h-3.5 w-3.5" /> {t('common.cancel')}
              </Button>
              <Button size="sm" onClick={saveEdit} disabled={updateMut.isPending} className="gap-1.5">
                <Check className="h-3.5 w-3.5" /> {t('common.save')}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant={ad.sold ? 'secondary' : 'ghost'}
                size="sm"
                className="gap-1.5"
                disabled={markSoldMut.isPending}
                onClick={() => {
                  markSoldMut.mutate({ id: ad.id, sold: !ad.sold }, {
                    onSuccess: () => toast(ad.sold ? t('adDetail.markedAvailable') : t('adDetail.markedSold'), 'success'),
                    onError: (err) => toast((err as Error).message, 'error'),
                  })
                }}
              >
                <Ban className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{ad.sold ? t('adDetail.markAvailable') : t('adDetail.markSold')}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                disabled={checkOnlineMut.isPending}
                onClick={() => {
                  checkOnlineMut.mutate(ad.id, {
                    onSuccess: (data) => {
                      toast(
                        data.sold ? t('adDetail.offlineMarkedSold') : t('adDetail.stillOnline'),
                        data.sold ? 'success' : 'info',
                      )
                    },
                    onError: (err) => toast((err as Error).message, 'error'),
                  })
                }}
              >
                <Wifi className={`h-3.5 w-3.5 ${checkOnlineMut.isPending ? 'animate-pulse' : ''}`} />
                <span className="hidden sm:inline">{checkOnlineMut.isPending ? t('common.checking') : t('common.checkOnline')}</span>
              </Button>
              <Button variant="secondary" size="sm" onClick={startEdit} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('common.edit')}</span>
              </Button>
              <a href={ad.url} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" size="sm" className="gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" /> <span className="hidden sm:inline">LeBonCoin</span>
                </Button>
              </a>
              <Button variant="danger" size="sm" onClick={() => setShowDeleteConfirm(true)} className="gap-1.5">
                <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('common.delete')}</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Superseded banner */}
      {ad.superseded_by && !editing && (
        <div className="rounded-xl bg-purple-500/10 border border-purple-500/20 px-4 py-3 text-sm text-purple-300 flex items-center gap-2">
          <History className="h-4 w-4 shrink-0" />
          <span>{t('adDetail.supersededBy')} </span>
          <Link to={`/ads/${ad.superseded_by}`} className="font-medium underline hover:text-purple-200 transition-colors">
            {t('adDetail.supersededByLink', { id: ad.superseded_by })}
          </Link>
          <span className="text-purple-300/60">{t('adDetail.supersededSuffix')}</span>
        </div>
      )}

      {/* Sold banner */}
      {!!ad.sold && !ad.superseded_by && !editing && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300 flex items-center gap-2">
          <Ban className="h-4 w-4 shrink-0" />
          {t('adDetail.soldBanner')}
        </div>
      )}

      {/* Repost chain banner */}
      {ad.previous_ad_id && !editing && (
        <div className="rounded-xl bg-purple-500/10 border border-purple-500/20 px-4 py-3 text-sm text-purple-300 flex items-center gap-2">
          <History className="h-4 w-4 shrink-0" />
          <span>{t('adDetail.repostOf')} </span>
          <Link to={`/ads/${ad.previous_ad_id}`} className="font-medium underline hover:text-purple-200 transition-colors">
            {t('adDetail.see', { id: ad.previous_ad_id })}
          </Link>
          {priceHistory && priceHistory.history.length >= 2 && (() => {
            const first = priceHistory.history[0].price
            const last = priceHistory.history[priceHistory.history.length - 1].price
            const delta = last - first
            const reposts = priceHistory.history.filter(h => h.source === 'repost').length
            return (
              <span className="text-purple-300/70">
                — {t('adDetail.repostInfo', { count: reposts, delta: `${delta < 0 ? '' : '+'}${delta}€` })}
              </span>
            )
          })()}
        </div>
      )}

      {/* Edit mode banner */}
      {editing && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-300 flex items-center gap-2">
          <Pencil className="h-4 w-4 shrink-0" />
          {t('adDetail.editBanner')}
        </div>
      )}

      {/* Bento Gallery */}
      {imageCount > 0 && (
        <div className="relative">
          {imageCount === 1 ? (
            <button onClick={() => setLightboxIdx(0)} className="w-full rounded-2xl overflow-hidden border border-white/[0.06] hover:border-amber-500/30 transition-all group">
              <img src={ad.images[0]} alt="" className="w-full h-64 md:h-80 object-cover group-hover:scale-[1.02] transition-transform duration-500" />
            </button>
          ) : imageCount === 2 ? (
            <div className="grid grid-cols-2 gap-2 h-64 md:h-80">
              {ad.images.slice(0, 2).map((url, i) => (
                <button key={i} onClick={() => setLightboxIdx(i)} className="rounded-2xl overflow-hidden border border-white/[0.06] hover:border-amber-500/30 transition-all group">
                  <img src={url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 grid-rows-2 gap-2 h-56 sm:h-64 md:h-80">
              <button onClick={() => setLightboxIdx(0)} className="col-span-1 sm:col-span-2 row-span-2 rounded-2xl overflow-hidden border border-white/[0.06] hover:border-amber-500/30 transition-all group">
                <img src={ad.images[0]} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500" loading="lazy" />
              </button>
              <button onClick={() => setLightboxIdx(1)} className="rounded-2xl overflow-hidden border border-white/[0.06] hover:border-amber-500/30 transition-all group">
                <img src={ad.images[1]} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
              </button>
              <button onClick={() => setLightboxIdx(2)} className="relative rounded-2xl overflow-hidden border border-white/[0.06] hover:border-amber-500/30 transition-all group">
                <img src={ad.images[Math.min(2, imageCount - 1)]} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                {imageCount > 3 && (
                  <div className="absolute inset-0 bg-bg/60 flex items-center justify-center">
                    <span className="text-white text-sm font-semibold">+{imageCount - 3}</span>
                  </div>
                )}
              </button>
            </div>
          )}
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-bg/70 backdrop-blur-md rounded-full px-3 py-1.5 text-xs text-white/70">
            <Camera className="h-3.5 w-3.5" />
            {t('adDetail.photo', { count: imageCount })}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <div
          className="fixed inset-0 bg-bg/95 backdrop-blur-xl z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={t('adDetail.photoLightbox')}
          onClick={() => setLightboxIdx(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setLightboxIdx(null) }}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10"
            onClick={(e) => { e.stopPropagation(); setLightboxIdx(null) }}
            aria-label={t('common.close')}
          >
            <X className="h-5 w-5" />
          </button>
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10"
            onClick={(e) => { e.stopPropagation(); setLightboxIdx(Math.max(0, lightboxIdx - 1)) }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <img
            src={ad.images[lightboxIdx]}
            alt=""
            className="max-h-[85vh] max-w-[85vw] object-contain rounded-lg"
          />
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10"
            onClick={(e) => { e.stopPropagation(); setLightboxIdx(Math.min(ad.images.length - 1, lightboxIdx + 1)) }}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-md rounded-full px-4 py-1.5 text-sm text-white/70">
            {lightboxIdx + 1} / {ad.images.length}
          </div>
        </div>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card className="p-6 space-y-4">
          <h2 className="text-[11px] text-text-muted uppercase tracking-widest font-semibold">{t('adDetail.characteristics')}</h2>
          <div className="grid grid-cols-2 gap-y-3 text-sm">
            <span className="text-text-muted">{t('common.price')}</span>
            <span className="font-semibold text-amber-300 text-lg font-fraunces">{formatPrice(ad.price)}</span>
            <span className="text-text-muted">{t('common.year')}</span>
            <span className="text-text-primary">{ad.year ?? t('common.na')}</span>
            <span className="text-text-muted">{t('common.mileage')}</span>
            <span className="text-text-primary">{formatKm(ad.mileage_km)}</span>

            {/* Variante */}
            <span className="text-text-muted">{t('common.variant')}</span>
            {editing ? (
              <div className="flex flex-wrap gap-1.5">
                {VARIANTS.map((v) => (
                  <button key={v} onClick={() => setEditVariant(v)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${v === editVariant ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40' : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08]'}`}>
                    {v}
                  </button>
                ))}
              </div>
            ) : (
              <Badge className={variantColor(ad.variant)}>{ad.variant ?? t('common.na')}</Badge>
            )}

            {/* Couleur */}
            <span className="text-text-muted">{t('common.color')}</span>
            {editing ? (
              <div className="flex flex-wrap gap-1.5">
                {availableColors.map((c) => (
                  <button key={c} onClick={() => setEditColor(c)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${c === editColor ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40' : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08]'}`}>
                    {c}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-text-primary">{ad.color ?? t('common.na')}</span>
            )}

            {/* Jantes */}
            <span className="text-text-muted">{t('common.wheels')}</span>
            {editing ? (
              <div className="flex gap-1.5">
                {WHEEL_TYPES.map((w) => (
                  <button key={w} onClick={() => setEditWheelType(w)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${w === editWheelType ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40' : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08]'}`}>
                    {w}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-text-primary">{ad.wheel_type ?? t('common.na')}</span>
            )}

            <span className="text-text-muted">{t('common.seller')}</span>
            <span className="text-text-primary">{ad.seller_type === 'pro' ? t('common.professional') : t('common.private')}</span>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="text-[11px] text-text-muted uppercase tracking-widest font-semibold">{t('adDetail.locationAndValue')}</h2>
          <div className="grid grid-cols-2 gap-y-3 text-sm">
            <span className="text-text-muted flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {t('adDetail.city')}</span>
            <span className="text-text-primary">{ad.city ?? '?'}</span>
            <span className="text-text-muted">{t('adDetail.zipcode')}</span>
            <span className="text-text-primary">{ad.zipcode ?? t('common.na')}</span>
            <span className="text-text-muted">{t('adDetail.department')}</span>
            <span className="text-text-primary">{ad.department ?? t('common.na')}</span>
            <span className="text-text-muted flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {t('adDetail.publication')}</span>
            <span className="text-text-primary">{ad.first_publication_date ? new Date(ad.first_publication_date).toLocaleDateString('fr-FR') : t('common.na')}</span>
            <span className="text-text-muted">{t('common.newRefPrice')}</span>
            <span className="text-text-primary">{formatPrice(ad.estimated_new_price)}</span>
            {ad.price != null && ad.estimated_new_price != null && (
              <>
                <span className="text-text-muted">{t('adDetail.newPriceGap')}</span>
                <span className={ad.price < ad.estimated_new_price ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                  {((ad.price - ad.estimated_new_price) / ad.estimated_new_price * 100).toFixed(1)}%
                </span>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* Price history */}
      {priceHistory && priceHistory.history.length > 0 && (
        <Card className="p-6">
          <h2 className="text-[11px] text-text-muted uppercase tracking-widest font-semibold mb-4 flex items-center gap-2">
            <History className="h-3.5 w-3.5" />
            {t('adDetail.priceHistory')} ({t('adDetail.entry', { count: priceHistory.history.length })})
          </h2>
          <div className="relative">
            {/* Timeline */}
            <div className="absolute left-[18px] top-3 bottom-3 w-px bg-white/[0.08]" />
            <div className="space-y-0">
              {priceHistory.history.map((entry, i) => {
                const prev = i > 0 ? priceHistory.history[i - 1] : null
                const delta = prev ? entry.price - prev.price : 0
                const isDown = delta < 0
                const isLatest = i === priceHistory.history.length - 1

                return (
                  <div key={entry.id} className="relative flex items-start gap-4 py-3">
                    {/* Dot */}
                    <div className={`relative z-10 w-[9px] h-[9px] rounded-full mt-1.5 shrink-0 ring-2 ring-bg ${
                      isLatest ? 'bg-amber-400' : entry.source === 'repost' ? 'bg-purple-400' : entry.source === 'price_update' ? 'bg-emerald-400' : 'bg-white/30'
                    }`} style={{ marginLeft: '14px' }} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-semibold tabular-nums text-text-primary font-fraunces">
                          {formatPrice(entry.price)}
                        </span>
                        {delta !== 0 && (
                          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${isDown ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isDown ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                            {isDown ? '' : '+'}{delta}€
                          </span>
                        )}
                        <Badge className={`text-[10px] ${
                          entry.source === 'initial' ? 'bg-white/[0.06] text-text-dim' :
                          entry.source === 'repost' ? 'bg-purple-500/15 text-purple-300' :
                          entry.source === 'price_update' ? 'bg-emerald-500/15 text-emerald-300' :
                          'bg-amber-500/15 text-amber-300'
                        }`}>
                          {entry.source === 'initial' ? t('adDetail.initialPublication') :
                           entry.source === 'repost' ? t('adDetail.repost') :
                           entry.source === 'price_update' ? t('adDetail.priceUpdate') :
                           t('adDetail.manualEntry')}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-text-dim flex-wrap">
                        <span>{new Date(entry.recorded_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        {entry.note && <span className="text-text-dim/70 truncate max-w-xs">{entry.note}</span>}
                        {entry.previous_ad_id && (
                          <Link to={`/ads/${entry.previous_ad_id}`} className="text-purple-300/70 hover:text-purple-300 transition-colors shrink-0">
                            {t('adDetail.see', { id: entry.previous_ad_id })}
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          {/* Summary */}
          {priceHistory.history.length >= 2 && (() => {
            const first = priceHistory.history[0].price
            const last = priceHistory.history[priceHistory.history.length - 1].price
            const totalDelta = last - first
            const pct = first > 0 ? ((totalDelta / first) * 100).toFixed(1) : '0'
            return (
              <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center gap-4 text-sm">
                <span className="text-text-muted">{t('adDetail.totalEvolution')}</span>
                <span className={`font-semibold tabular-nums ${totalDelta < 0 ? 'text-emerald-400' : totalDelta > 0 ? 'text-red-400' : 'text-text-muted'}`}>
                  {totalDelta < 0 ? '' : '+'}{totalDelta}€ ({totalDelta <= 0 ? '' : '+'}{pct}%)
                </span>
                <span className="text-text-dim text-xs">
                  {t('adDetail.repostCount', { count: priceHistory.history.filter(h => h.source === 'repost').length })}
                  {priceHistory.history.filter(h => h.source === 'price_update').length > 0 && (
                    <> · {t('adDetail.priceChangeCount', { count: priceHistory.history.filter(h => h.source === 'price_update').length })}</>
                  )}
                </span>
              </div>
            )
          })()}
        </Card>
      )}

      {/* Accessories table */}
      {(currentAccessories.length > 0 || editing) && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] text-text-muted uppercase tracking-widest font-semibold">
              {t('adDetail.accessories')} ({currentAccessories.length})
            </h2>
            <div className="flex gap-2">
              {editing ? (
                <Button size="sm" variant="secondary" onClick={() => setShowAddAccessory(!showAddAccessory)} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> {t('common.add')}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    refreshAccMut.mutate(ad!.id, {
                      onSuccess: (data) => {
                        toast(t('adDetail.recalculated', { before: data.before, after: data.after }), 'success')
                      },
                      onError: (err) => toast((err as Error).message, 'error'),
                    })
                  }}
                  disabled={refreshAccMut.isPending}
                  className="gap-1.5"
                  title={t('adDetail.recalculateTitle')}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshAccMut.isPending ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">{t('adDetail.recalculate')}</span>
                </Button>
              )}
            </div>
          </div>

          {/* Add accessory search */}
          {editing && showAddAccessory && (
            <div className="mb-4 rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-3">
              <input
                type="text"
                placeholder={t('common.searchAccessory')}
                value={accessorySearch}
                onChange={(e) => setAccessorySearch(e.target.value)}
                className="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-sm text-text-primary placeholder-text-dim focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all"
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto space-y-1">
                {catalogFiltered.slice(0, 20).map((c) => (
                  <button
                    key={c.name}
                    onClick={() => addAccessory(c)}
                    className="w-full flex items-center gap-2 py-2 px-2 rounded-lg text-sm hover:bg-white/[0.05] transition-colors text-left"
                  >
                    <CategoryBadge category={c.category} />
                    <span className="flex-1 text-text-primary">{c.name}</span>
                    <span className="text-xs text-text-dim">{c.estimated_new_price} &euro;</span>
                  </button>
                ))}
                {catalogFiltered.length === 0 && (
                  <p className="text-sm text-text-dim py-2 text-center">{t('common.noAccessoryMatch')}</p>
                )}
              </div>
            </div>
          )}

          {currentAccessories.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-text-dim uppercase tracking-widest border-b border-white/[0.06]">
                    <th className="pb-3 pr-4 font-semibold">{t('adDetail.category')}</th>
                    <th className="pb-3 pr-4 font-semibold">{t('adDetail.name')}</th>
                    <th className="pb-3 text-right pr-4 font-semibold">{t('common.new')}</th>
                    <th className="pb-3 text-right font-semibold">{editing ? '' : t('common.used')}</th>
                    {editing && <th className="pb-3 w-8"></th>}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(accByCategory).map(([cat, accs]) =>
                    accs.map((a) => (
                      <tr key={a.name} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 pr-4">
                          <CategoryBadge category={cat} />
                        </td>
                        <td className="py-2.5 pr-4 text-text-primary">
                          {a.name}
                          {a.source === 'manual' && (
                            <span className="ml-2 text-[10px] text-amber-400/60 uppercase">{t('common.manual')}</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-text-muted">{a.estimated_new_price} &euro;</td>
                        <td className="py-2.5 text-right text-text-secondary">
                          {editing ? '' : `${a.estimated_used_price} \u20ac`}
                        </td>
                        {editing && (
                          <td className="py-2.5 text-center">
                            <button onClick={() => {
                              const idx = currentAccessories.findIndex((x) => x.name === a.name)
                              if (idx >= 0) removeAccessory(idx)
                            }}
                              className="p-1 rounded-md text-text-dim hover:text-red-400 hover:bg-red-500/10 transition-all"
                              title={t('common.removeAccessory')}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    )),
                  )}
                </tbody>
                {!editing && (
                  <tfoot>
                    <tr className="border-t border-white/[0.08] font-semibold">
                      <td className="pt-3" colSpan={2}>{t('common.total')}</td>
                      <td className="pt-3 text-right pr-4 text-text-muted">{currentAccessories.reduce((s, a) => s + a.estimated_new_price, 0)} &euro;</td>
                      <td className="pt-3 text-right text-amber-300">{currentAccessories.reduce((s, a) => s + a.estimated_used_price, 0)} &euro;</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Raw LBC attributes */}
      {ad.attributes?.length > 0 && (
        <Accordion.Root type="single" collapsible>
          <Accordion.Item value="attrs">
            <Card>
              <Accordion.Trigger className="w-full flex items-center justify-between p-6 text-[11px] font-semibold text-text-muted uppercase tracking-widest group cursor-pointer">
                {t('adDetail.lbcAttributes')} ({ad.attributes.length})
                <ChevronDown className="h-4 w-4 text-text-dim group-data-[state=open]:rotate-180 transition-transform duration-200" />
              </Accordion.Trigger>
              <Accordion.Content className="overflow-hidden data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp">
                <div className="px-6 pb-6">
                  <table className="w-full text-sm">
                    <tbody>
                      {ad.attributes.map((a) => (
                        <tr key={a.key} className="border-b border-white/[0.03]">
                          <td className="py-2 pr-4 text-text-dim font-mono text-xs">{a.key}</td>
                          <td className="py-2 text-text-secondary">{a.value_label ?? a.value ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Accordion.Content>
            </Card>
          </Accordion.Item>
        </Accordion.Root>
      )}
      {/* Delete confirmation dialog */}
      <Dialog.Root open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-md z-40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md bg-surface border border-white/[0.08] rounded-2xl p-7 z-50 shadow-2xl shadow-black/50">
            <Dialog.Title className="text-lg font-semibold text-text-primary font-fraunces">
              {t('adDetail.deleteConfirmTitle')}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-text-muted mt-2">
              {t('adDetail.deleteConfirmDescription')}
            </Dialog.Description>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)}>{t('common.cancel')}</Button>
              <Button variant="danger" onClick={() => { setShowDeleteConfirm(false); handleDelete() }} disabled={deleteMut.isPending} className="gap-1.5">
                <Trash2 className="h-3.5 w-3.5" /> {t('common.delete')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </motion.div>
  )
}
