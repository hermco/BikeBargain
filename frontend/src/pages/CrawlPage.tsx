import { useState, useRef, useCallback, useEffect } from 'react'
import { Search, Loader2, Play, Pause, SkipForward, Check, X, AlertTriangle, ArrowRight, ExternalLink, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Pencil, Trash2, Plus, Maximize2, Copy, DollarSign } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { CategoryBadge } from '../components/AccessoryBadge'
import { useToast } from '../components/Toast'
import { useCrawlSearch, useCrawlExtract, useCrawlConfirm, useMergeAd, useAccessoryCatalog, useActiveCrawlSession, useUpdateCrawlAdAction, useCloseCrawlSession, useRemoveCrawlSessionAd, useCheckPrices, useConfirmPrice } from '../hooks/queries'
import { formatPrice, variantColor } from '../lib/utils'
import type { CrawlAdSummary, CrawlDiff, Accessory, PotentialDuplicate, PriceChangeEntry } from '../types'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const VARIANTS = ['Base', 'Pass', 'Summit', 'Mana Black'] as const
const COLORS: Record<string, string[]> = {
  Base: ['Kaza Brown'],
  Pass: ['Slate Himalayan Salt', 'Slate Poppy Blue'],
  Summit: ['Hanle Black', 'Kamet White'],
  'Mana Black': ['Mana Black'],
}
const WHEEL_TYPES = ['standard', 'tubeless'] as const
const CRAWL_DELAY_MS = 5000

type CrawlStatus = 'idle' | 'searching' | 'ready' | 'crawling' | 'paused' | 'waiting_validation' | 'done'
type AdAction = 'pending' | 'extracting' | 'waiting' | 'confirmed' | 'skipped' | 'error'

interface AdState {
  summary: CrawlAdSummary
  action: AdAction
  extractData?: Record<string, unknown>
  existingData?: Record<string, unknown> | null
  diffs?: CrawlDiff[]
  existsInDb?: boolean
  potentialDuplicates?: PotentialDuplicate[]
  error?: string
}

export function CrawlPage() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<CrawlStatus>('idle')
  const [adStates, setAdStates] = useState<AdState[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [processedCount, setProcessedCount] = useState(0)
  const [confirmedCount, setConfirmedCount] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [showProcessed, setShowProcessed] = useState(false)
  const [galleryIdx, setGalleryIdx] = useState(0)
  const [showAddAccessory, setShowAddAccessory] = useState(false)
  const [accessorySearch, setAccessorySearch] = useState('')
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [showDescription, setShowDescription] = useState(true)
  const [isManualPick, setIsManualPick] = useState(false)
  const [showInDb, setShowInDb] = useState(false)
  const [hideNewListings, setHideNewListings] = useState(false)
  const [priceChanges, setPriceChanges] = useState<PriceChangeEntry[]>([])
  const [confirmedPriceIds, setConfirmedPriceIds] = useState<Set<number>>(new Set())
  const [dismissedPriceIds, setDismissedPriceIds] = useState<Set<number>>(new Set())

  // Transition state after confirm/skip — shows countdown before next extraction
  const [transition, setTransition] = useState<{ type: 'confirmed' | 'skipped'; subject: string; countdown: number } | null>(null)
  const transitionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const pauseRef = useRef(false)
  const abortRef = useRef(false)
  const showInDbRef = useRef(false)
  const hideNewListingsRef = useRef(false)

  const [sessionId, setSessionId] = useState<number | null>(null)

  const searchMut = useCrawlSearch()
  const extractMut = useCrawlExtract()
  const confirmMut = useCrawlConfirm()
  const mergeMut = useMergeAd()
  const updateActionMut = useUpdateCrawlAdAction()
  const closeSessionMut = useCloseCrawlSession()
  const removeAdMut = useRemoveCrawlSessionAd()
  const { data: catalog } = useAccessoryCatalog()
  const { data: activeSession, isLoading: isLoadingSession } = useActiveCrawlSession()
  const { toast } = useToast()
  const checkPricesMut = useCheckPrices()
  const confirmPriceMut = useConfirmPrice()

  // Keep ref in sync for use inside processNext callback
  useEffect(() => { showInDbRef.current = showInDb }, [showInDb])
  useEffect(() => { hideNewListingsRef.current = hideNewListings }, [hideNewListings])

  // ─── Restore session on mount ─────────────────────────────────────────

  const restoredRef = useRef(false)

  useEffect(() => {
    if (restoredRef.current || isLoadingSession || !activeSession) return
    restoredRef.current = true

    const states: AdState[] = activeSession.ads.map((ad) => ({
      summary: {
        id: ad.id,
        url: ad.url,
        subject: ad.subject,
        price: ad.price,
        city: ad.city,
        department: ad.department,
        thumbnail: ad.thumbnail,
        exists_in_db: ad.exists_in_db,
        possible_repost_of: null,
        is_new_listing: ad.is_new_listing,
      },
      action: ad.action as AdAction,
    }))

    setSessionId(activeSession.session_id)
    setAdStates(states)

    const confirmed = states.filter((s) => s.action === 'confirmed').length
    const skipped = states.filter((s) => s.action === 'skipped').length
    const errors = states.filter((s) => s.action === 'error').length
    const processed = confirmed + skipped + errors

    setConfirmedCount(confirmed)
    setSkippedCount(skipped)
    setProcessedCount(processed)

    const hasPending = states.some((s) => s.action === 'pending')
    setStatus(hasPending ? 'ready' : 'done')
  }, [activeSession, isLoadingSession])

  // ─── Search ────────────────────────────────────────────────────────────

  function handleSearch() {
    setStatus('searching')
    setAdStates([])
    setCurrentIndex(-1)
    setProcessedCount(0)
    setConfirmedCount(0)
    setSkippedCount(0)
    setIsManualPick(false)
    setShowInDb(false)
    setTransition(null)
    if (transitionTimerRef.current) { clearInterval(transitionTimerRef.current); transitionTimerRef.current = null }
    abortRef.current = false
    pauseRef.current = false

    searchMut.mutate(undefined, {
      onSuccess: (data) => {
        setSessionId(data.session_id)
        const states: AdState[] = data.ads.map((ad) => ({
          summary: ad,
          action: 'pending' as AdAction,
        }))
        setAdStates(states)
        setStatus('ready')
      },
      onError: (err) => {
        toast((err as Error).message, 'error')
        setStatus('idle')
      },
    })
  }

  function handleCheckPrices() {
    checkPricesMut.mutate(undefined, {
      onSuccess: (data) => {
        setPriceChanges(data.price_changes)
        setConfirmedPriceIds(new Set())
        setDismissedPriceIds(new Set())
        if (data.price_changes.length === 0) {
          toast(t('crawl.noPriceChanges') + ` (${t('crawl.checkedCount', { count: data.checked_count })})`, 'info')
        }
      },
      onError: (err) => {
        toast((err as Error).message, 'error')
      },
    })
  }

  function handleConfirmPrice(adId: number, newPrice: number) {
    confirmPriceMut.mutate({ adId, newPrice }, {
      onSuccess: () => {
        setConfirmedPriceIds(prev => new Set(prev).add(adId))
        toast(t('crawl.priceChangeConfirmed'), 'success')
      },
      onError: (err) => {
        toast((err as Error).message, 'error')
      },
    })
  }

  function handleDismissPrice(adId: number) {
    setDismissedPriceIds(prev => new Set(prev).add(adId))
  }

  // ─── Crawl loop ────────────────────────────────────────────────────────

  const processNext = useCallback((states: AdState[], startIdx: number) => {
    if (abortRef.current) {
      setStatus('done')
      return
    }

    // Find next pending ad (skip in-DB ads if toggle is off)
    let nextIdx = -1
    for (let i = startIdx; i < states.length; i++) {
      if (states[i].action === 'pending') {
        if (!showInDbRef.current && states[i].summary.exists_in_db) continue
        if (hideNewListingsRef.current && states[i].summary.is_new_listing) continue
        nextIdx = i
        break
      }
    }

    if (nextIdx === -1) {
      setStatus('done')
      return
    }

    if (pauseRef.current) {
      setStatus('paused')
      setCurrentIndex(nextIdx)
      return
    }

    setCurrentIndex(nextIdx)
    setStatus('crawling')

    // Mark as extracting
    const updated = [...states]
    updated[nextIdx] = { ...updated[nextIdx], action: 'extracting' }
    setAdStates(updated)

    const ad = states[nextIdx].summary
    extractMut.mutate(
      { adId: ad.id, url: ad.url },
      {
        onSuccess: (result) => {
          const newStates = [...updated]
          newStates[nextIdx] = {
            ...newStates[nextIdx],
            summary: {
              ...newStates[nextIdx].summary,
              is_new_listing: result.is_new_listing,
            },
            action: 'waiting',
            extractData: result.ad_data,
            existingData: result.existing,
            diffs: result.diffs,
            existsInDb: result.exists_in_db,
            potentialDuplicates: result.potential_duplicates,
          }
          setAdStates(newStates)
          setStatus('waiting_validation')
        },
        onError: (err) => {
          const newStates = [...updated]
          newStates[nextIdx] = {
            ...newStates[nextIdx],
            action: 'error',
            error: (err as Error).message,
          }
          setAdStates(newStates)
          setProcessedCount((c) => c + 1)

          // Persister l'action dans la session
          if (sessionId) {
            updateActionMut.mutate({ sessionId, adId: ad.id, action: 'error' })
          }

          // Continue after delay
          setTimeout(() => processNext(newStates, nextIdx + 1), CRAWL_DELAY_MS)
        },
      },
    )
  }, [extractMut, sessionId, updateActionMut])

  function handleStartCrawl() {
    setIsManualPick(false)
    pauseRef.current = false
    abortRef.current = false
    processNext(adStates, currentIndex >= 0 ? currentIndex : 0)
  }

  function handlePause() {
    pauseRef.current = true
    setStatus('paused')
  }

  function handleResume() {
    pauseRef.current = false
    processNext(adStates, currentIndex)
  }

  function handleManualPick(index: number) {
    const state = adStates[index]

    // If already extracted, jump directly to validation
    if (state.action === 'waiting' && state.extractData) {
      setIsManualPick(true)
      setCurrentIndex(index)
      setStatus('waiting_validation')
      return
    }

    if (state.action !== 'pending') return

    setIsManualPick(true)
    setCurrentIndex(index)
    setStatus('crawling')
    setEditingField(null)
    setGalleryIdx(0)
    setLightboxOpen(false)
    setShowAddAccessory(false)
    setAccessorySearch('')

    const updated = [...adStates]
    updated[index] = { ...updated[index], action: 'extracting' }
    setAdStates(updated)

    const ad = state.summary
    extractMut.mutate(
      { adId: ad.id, url: ad.url },
      {
        onSuccess: (result) => {
          const newStates = [...updated]
          newStates[index] = {
            ...newStates[index],
            action: 'waiting',
            extractData: result.ad_data,
            existingData: result.existing,
            diffs: result.diffs,
            existsInDb: result.exists_in_db,
            potentialDuplicates: result.potential_duplicates,
          }
          setAdStates(newStates)
          setStatus('waiting_validation')
        },
        onError: (err) => {
          const newStates = [...updated]
          newStates[index] = {
            ...newStates[index],
            action: 'error',
            error: (err as Error).message,
          }
          setAdStates(newStates)
          setProcessedCount((c) => c + 1)
          if (sessionId) {
            updateActionMut.mutate({ sessionId, adId: ad.id, action: 'error' })
          }
          setIsManualPick(false)
          setStatus('ready')
          toast((err as Error).message, 'error')
        },
      },
    )
  }

  function handleBackToGrid() {
    setIsManualPick(false)
    setStatus('ready')
    setCurrentIndex(-1)
    setEditingField(null)
    setGalleryIdx(0)
    setLightboxOpen(false)
    setShowAddAccessory(false)
    setAccessorySearch('')
  }

  function startTransition(type: 'confirmed' | 'skipped', subject: string, then: () => void) {
    const total = CRAWL_DELAY_MS / 1000
    setTransition({ type, subject, countdown: total })
    setStatus('crawling') // exit waiting_validation so the card hides

    if (transitionTimerRef.current) clearInterval(transitionTimerRef.current)
    transitionTimerRef.current = setInterval(() => {
      setTransition((prev) => {
        if (!prev || prev.countdown <= 1) return prev
        return { ...prev, countdown: prev.countdown - 1 }
      })
    }, 1000)

    setTimeout(() => {
      if (transitionTimerRef.current) {
        clearInterval(transitionTimerRef.current)
        transitionTimerRef.current = null
      }
      setTransition(null)
      then()
    }, CRAWL_DELAY_MS)
  }

  // ─── Validation actions ────────────────────────────────────────────────

  function handleConfirm() {
    if (currentIndex < 0 || transition) return
    const state = adStates[currentIndex]
    if (!state.extractData) return

    confirmMut.mutate(state.extractData, {
      onSuccess: () => {
        const updated = [...adStates]
        updated[currentIndex] = { ...updated[currentIndex], action: 'confirmed' }
        setAdStates(updated)
        setProcessedCount((c) => c + 1)
        setConfirmedCount((c) => c + 1)
        setEditingField(null)
        setGalleryIdx(0)
        setLightboxOpen(false)
        setShowAddAccessory(false)
        setAccessorySearch('')

        // Persister l'action dans la session
        if (sessionId) {
          updateActionMut.mutate({ sessionId, adId: state.summary.id, action: 'confirmed' })
        }

        // Manual pick: return to grid. Auto: transition then next
        if (isManualPick) {
          setIsManualPick(false)
          setStatus('ready')
          setCurrentIndex(-1)
          toast(t('crawl.adAddedToast', { subject: state.summary.subject }), 'success')
        } else {
          startTransition('confirmed', state.summary.subject ?? '', () => processNext(updated, currentIndex + 1))
        }
      },
      onError: (err) => {
        toast((err as Error).message, 'error')
      },
    })
  }

  function handleSkip() {
    if (currentIndex < 0 || transition) return
    const state = adStates[currentIndex]
    const updated = [...adStates]
    updated[currentIndex] = { ...updated[currentIndex], action: 'skipped' }
    setAdStates(updated)
    setProcessedCount((c) => c + 1)
    setSkippedCount((c) => c + 1)
    setEditingField(null)
    setGalleryIdx(0)
    setLightboxOpen(false)
    setShowAddAccessory(false)
    setAccessorySearch('')

    // Persister l'action dans la session
    if (sessionId) {
      updateActionMut.mutate({ sessionId, adId: state.summary.id, action: 'skipped' })
    }

    // Manual pick: return to grid. Auto: transition then next
    if (isManualPick) {
      setIsManualPick(false)
      setStatus('ready')
      setCurrentIndex(-1)
      toast(t('crawl.adSkippedToast', { subject: state.summary.subject }), 'info')
    } else {
      startTransition('skipped', state.summary.subject ?? '', () => processNext(updated, currentIndex + 1))
    }
  }

  function handleMerge(oldAdId: number) {
    if (currentIndex < 0 || transition) return
    const state = adStates[currentIndex]
    if (!state.extractData) return

    mergeMut.mutate({ newAdData: state.extractData, oldAdId }, {
      onSuccess: (result) => {
        const updated = [...adStates]
        updated[currentIndex] = { ...updated[currentIndex], action: 'confirmed' }
        setAdStates(updated)
        setProcessedCount((c) => c + 1)
        setConfirmedCount((c) => c + 1)
        setEditingField(null)
        setGalleryIdx(0)
        setLightboxOpen(false)
        setShowAddAccessory(false)
        setAccessorySearch('')

        if (sessionId) {
          updateActionMut.mutate({ sessionId, adId: state.summary.id, action: 'confirmed' })
        }

        const delta = result.price_delta
        const deltaStr = delta < 0 ? `${delta}€` : delta > 0 ? `+${delta}€` : t('crawl.samePrice')
        toast(t('crawl.merged', { id: oldAdId, delta: deltaStr }), 'success')

        if (isManualPick) {
          setIsManualPick(false)
          setStatus('ready')
          setCurrentIndex(-1)
        } else {
          startTransition('confirmed', state.summary.subject ?? '', () => processNext(updated, currentIndex + 1))
        }
      },
      onError: (err) => {
        toast((err as Error).message, 'error')
      },
    })
  }

  function updateExtractField(field: string, value: unknown) {
    if (currentIndex < 0) return
    const state = adStates[currentIndex]
    if (!state.extractData) return

    const updated = [...adStates]
    updated[currentIndex] = {
      ...updated[currentIndex],
      extractData: { ...state.extractData, [field]: value },
    }
    setAdStates(updated)
    setEditingField(null)
  }

  function removeAccessory(accIndex: number) {
    if (currentIndex < 0) return
    const state = adStates[currentIndex]
    if (!state.extractData) return

    const accessories = [...(state.extractData.accessories as Accessory[])]
    accessories.splice(accIndex, 1)

    const updated = [...adStates]
    updated[currentIndex] = {
      ...updated[currentIndex],
      extractData: { ...state.extractData, accessories },
    }
    setAdStates(updated)
  }

  function addAccessory(acc: { name: string; category: string; estimated_new_price: number; estimated_used_price: number }) {
    if (currentIndex < 0) return
    const state = adStates[currentIndex]
    if (!state.extractData) return

    const accessories = [...(state.extractData.accessories as Accessory[])]
    if (accessories.some((a) => a.name === acc.name)) return

    accessories.push({ ...acc, source: 'manual' })

    const updated = [...adStates]
    updated[currentIndex] = {
      ...updated[currentIndex],
      extractData: { ...state.extractData, accessories },
    }
    setAdStates(updated)
    setShowAddAccessory(false)
    setAccessorySearch('')
  }

  // Cleanup transition timer on unmount
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearInterval(transitionTimerRef.current)
    }
  }, [])

  // ─── Current ad state for rendering ────────────────────────────────────

  // Lightbox keyboard navigation
  useEffect(() => {
    if (!lightboxOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightboxOpen(false)
      if (e.key === 'ArrowLeft') setGalleryIdx((prev) => prev - 1)
      if (e.key === 'ArrowRight') setGalleryIdx((prev) => prev + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxOpen])

  const currentAd = currentIndex >= 0 ? adStates[currentIndex] : null
  const currentExtract = currentAd?.extractData
  const pendingCount = adStates.filter((s) => s.action === 'pending').length
  const inDbCount = adStates.filter((s) => s.summary.exists_in_db && s.action === 'pending').length
  const newListingCount = adStates.filter((s) => s.summary.is_new_listing && s.action === 'pending').length

  // Ads filtered by showInDb and hideNewListings toggles
  const visibleAdStates = adStates.filter((s) => {
    if (!showInDb && s.summary.exists_in_db && s.action === 'pending') return false
    if (hideNewListings && s.summary.is_new_listing && s.action === 'pending') return false
    return true
  })
  const newCount = adStates.filter((s) => !s.summary.exists_in_db && s.action === 'pending').length
  const variant = currentExtract?.variant as string | null
  const availableColors = variant ? COLORS[variant] ?? [] : Object.values(COLORS).flat()
  const accessories = (currentExtract?.accessories ?? []) as Accessory[]
  const catalogFiltered = (catalog ?? []).filter((c) => {
    if (accessories.some((a) => a.name === c.name)) return false
    if (!accessorySearch) return true
    const q = accessorySearch.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
  })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
            {t('crawl.title')}
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {t('crawl.subtitle')}
          </p>
        </div>
      </div>

      {/* Status bar */}
      {adStates.length > 0 && (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-text-muted">{t('crawl.total')} <span className="text-text-primary font-medium">{adStates.length}</span></span>
              <span className="text-text-muted">{t('crawl.processed')} <span className="text-text-primary font-medium">{processedCount}</span></span>
              <span className="text-text-muted">{t('crawl.confirmed')} <span className="text-green-400 font-medium">{confirmedCount}</span></span>
              <span className="text-text-muted">{t('crawl.skipped')} <span className="text-text-dim font-medium">{skippedCount}</span></span>
              <span className="text-text-muted">{t('crawl.remaining')} <span className="text-amber-300 font-medium">{pendingCount}</span></span>
            </div>
            <div className="flex items-center gap-2">
              {status === 'ready' && (
                <>
                  <Button size="sm" variant="secondary" onClick={() => {
                    if (sessionId) closeSessionMut.mutate(sessionId)
                    restoredRef.current = true
                    setSessionId(null)
                    setStatus('idle')
                    setAdStates([])
                    setCurrentIndex(-1)
                    setProcessedCount(0)
                    setConfirmedCount(0)
                    setSkippedCount(0)
                    setTransition(null)
                    if (transitionTimerRef.current) { clearInterval(transitionTimerRef.current); transitionTimerRef.current = null }
                  }} className="gap-1.5">
                    <Search className="h-3.5 w-3.5" />
                    {t('crawl.newSearch')}
                  </Button>
                  <Button size="sm" onClick={handleStartCrawl} className="gap-1.5">
                    <Play className="h-3.5 w-3.5" />
                    {t('crawl.startProcessing')}
                  </Button>
                </>
              )}
              {(status === 'crawling' || status === 'waiting_validation') && !isManualPick && (
                <Button size="sm" variant="secondary" onClick={handlePause} className="gap-1.5">
                  <Pause className="h-3.5 w-3.5" />
                  {t('crawl.pause')}
                </Button>
              )}
              {status === 'paused' && (
                <Button size="sm" onClick={handleResume} className="gap-1.5">
                  <Play className="h-3.5 w-3.5" />
                  {t('crawl.resume')}
                </Button>
              )}
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500"
              style={{ width: `${adStates.length > 0 ? (processedCount / adStates.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Loading session */}
      {isLoadingSession && status === 'idle' && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-amber-400 mb-3" />
          <p className="text-sm text-text-muted">{t('common.loading')}</p>
        </div>
      )}

      {/* Search / start section */}
      {!isLoadingSession && (status === 'idle' || status === 'searching') && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400/20 to-amber-600/20 flex items-center justify-center mb-6">
            <Search className="h-7 w-7 text-amber-400" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary mb-2" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
            {t('crawl.searchTitle')}
          </h2>
          <p className="text-sm text-text-muted mb-6 text-center max-w-md">
            {t('crawl.searchDescription')}
          </p>
          <Button onClick={handleSearch} disabled={status === 'searching'} className="gap-2">
            {status === 'searching' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('crawl.searching')}
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                {t('crawl.startSearch')}
              </>
            )}
          </Button>
          {searchMut.error && (
            <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400 max-w-md">
              {(searchMut.error as Error).message}
            </div>
          )}
          <Button
            onClick={handleCheckPrices}
            disabled={checkPricesMut.isPending}
            variant="secondary"
            className="gap-2 mt-3"
          >
            {checkPricesMut.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('crawl.checkingPrices')}
              </>
            ) : (
              <>
                <DollarSign className="h-4 w-4" />
                {t('crawl.checkPrices')}
              </>
            )}
          </Button>
        </div>
      )}

      {/* Price changes results */}
      {priceChanges.length > 0 && status === 'idle' && (
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-[11px] text-text-muted uppercase tracking-widest font-semibold flex items-center gap-2">
              <DollarSign className="h-3.5 w-3.5" />
              {t('crawl.priceChanges')}
            </h3>
            <Badge className="bg-amber-500/15 text-amber-300 text-[10px]">
              {t('crawl.priceChangeCount', { count: priceChanges.filter(pc => !confirmedPriceIds.has(pc.id) && !dismissedPriceIds.has(pc.id)).length })}
            </Badge>
          </div>
          <div className="space-y-2">
            {priceChanges.map((pc) => {
              const isConfirmed = confirmedPriceIds.has(pc.id)
              const isDismissed = dismissedPriceIds.has(pc.id)
              if (isDismissed) return null

              return (
                <div
                  key={pc.id}
                  className={`rounded-xl border p-4 transition-all ${
                    isConfirmed
                      ? 'bg-green-500/5 border-green-500/20 opacity-60'
                      : 'bg-card border-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Link to={`/ads/${pc.id}`} className="text-sm font-medium text-text-primary hover:text-amber-400 transition-colors truncate">
                          {pc.subject || `#${pc.id}`}
                        </Link>
                        {pc.city && (
                          <span className="text-[10px] text-text-dim shrink-0">{pc.city}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-text-muted tabular-nums">{formatPrice(pc.current_price)}</span>
                        <ArrowRight className="h-3 w-3 text-text-dim" />
                        <span className="text-sm font-semibold tabular-nums text-text-primary">{formatPrice(pc.new_price)}</span>
                        <span className={`text-xs font-semibold tabular-nums ${pc.price_delta < 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pc.price_delta < 0 ? '' : '+'}{pc.price_delta}€
                        </span>
                      </div>
                    </div>
                    {!isConfirmed && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleDismissPrice(pc.id)}
                          className="gap-1"
                        >
                          <X className="h-3.5 w-3.5" />
                          {t('crawl.priceChangeIgnore')}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleConfirmPrice(pc.id, pc.new_price)}
                          disabled={confirmPriceMut.isPending}
                          className="gap-1"
                        >
                          <Check className="h-3.5 w-3.5" />
                          {t('crawl.priceChangeConfirm')}
                        </Button>
                      </div>
                    )}
                    {isConfirmed && (
                      <Badge className="bg-green-500/15 text-green-300 text-[10px]">
                        <Check className="h-3 w-3 mr-1" />
                        {t('crawl.priceChangeConfirmed')}
                      </Badge>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Done state */}
      {status === 'done' && (
        <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-6 mb-6 text-center">
          <Check className="h-8 w-8 text-green-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-text-primary mb-1" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
            {t('crawl.doneTitle')}
          </h3>
          <p className="text-sm text-text-muted">
            {confirmedCount} {t(confirmedCount > 1 ? 'crawl.doneSummary_other' : 'crawl.doneSummary_one', { confirmed: confirmedCount, skipped: skippedCount })}
          </p>
          <Button onClick={() => {
            if (sessionId) closeSessionMut.mutate(sessionId)
            restoredRef.current = true
            setSessionId(null)
            setStatus('idle')
            setAdStates([])
            setCurrentIndex(-1)
            setProcessedCount(0)
            setConfirmedCount(0)
            setSkippedCount(0)
    setTransition(null)
    if (transitionTimerRef.current) { clearInterval(transitionTimerRef.current); transitionTimerRef.current = null }
          }} variant="secondary" className="mt-4 gap-2">
            <Search className="h-4 w-4" />
            {t('crawl.newSearch')}
          </Button>
        </div>
      )}

      {/* Current ad extraction / validation */}
      {currentAd && status === 'waiting_validation' && currentExtract && (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-6 mb-6">
          {/* Back button + Validation banner */}
          {isManualPick && (
            <button
              onClick={handleBackToGrid}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors mb-3"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {t('crawl.backToResults')}
            </button>
          )}
          <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-medium text-amber-300">
              {isManualPick
                ? t('crawl.manualBanner')
                : t('crawl.autoBanner')}
            </span>
          </div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-primary">
              {t('crawl.adCounter', { current: currentIndex + 1, total: adStates.length })}
            </h3>
            {currentAd.existsInDb && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-xs font-medium text-amber-300">{t('crawl.existsInDb')}</span>
              </div>
            )}
          </div>

          {/* Potential duplicates / repost detection */}
          {currentAd.potentialDuplicates && currentAd.potentialDuplicates.length > 0 && (
            <div className="rounded-xl bg-purple-500/10 border border-purple-500/20 p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Copy className="h-4 w-4 text-purple-400" />
                <h4 className="text-xs uppercase tracking-widest font-semibold text-purple-300">
                  {t('crawl.repostProbable')}
                </h4>
              </div>
              <div className="space-y-3">
                {currentAd.potentialDuplicates.map((dup) => (
                  <div key={dup.id} className="rounded-lg bg-purple-500/5 border border-purple-500/10 overflow-hidden">
                    <div className="p-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">{dup.subject}</p>
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-text-muted flex-wrap">
                            {dup.price != null && <span>{formatPrice(dup.price)}</span>}
                            {dup.city && <span>{dup.city}</span>}
                            {dup.mileage_km != null && <span>{dup.mileage_km.toLocaleString('fr-FR')} km</span>}
                            {dup.variant && <Badge className={variantColor(dup.variant)}>{dup.variant}</Badge>}
                            {dup.sold && <Badge className="bg-red-500/20 text-red-300 text-[10px]">Vendue</Badge>}
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {dup.reasons.map((r, i) => (
                              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300/80">{r}</span>
                            ))}
                          </div>
                        </div>
                        {/* Price delta highlight */}
                        {dup.price_delta != null && (
                          <div className={`shrink-0 text-center px-3 py-2 rounded-lg ${
                            dup.price_delta < 0 ? 'bg-emerald-500/10 border border-emerald-500/20' :
                            dup.price_delta > 0 ? 'bg-red-500/10 border border-red-500/20' :
                            'bg-white/[0.04] border border-white/[0.06]'
                          }`}>
                            <span className={`text-lg font-bold tabular-nums ${
                              dup.price_delta < 0 ? 'text-emerald-400' :
                              dup.price_delta > 0 ? 'text-red-400' :
                              'text-text-muted'
                            }`}>
                              {dup.price_delta === 0 ? '=' : dup.price_delta < 0 ? `${dup.price_delta}€` : `+${dup.price_delta}€`}
                            </span>
                            <p className={`text-[10px] mt-0.5 ${
                              dup.price_delta < 0 ? 'text-emerald-400/70' :
                              dup.price_delta > 0 ? 'text-red-400/70' :
                              'text-text-dim'
                            }`}>
                              {dup.price_delta < 0 ? t('crawl.priceDown') : dup.price_delta > 0 ? t('crawl.priceUp') : t('crawl.priceSame')}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Action bar */}
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-purple-500/5 border-t border-purple-500/10">
                      <Button
                        size="sm"
                        onClick={() => handleMerge(dup.id)}
                        disabled={mergeMut.isPending || !!transition}
                        className="gap-1.5"
                      >
                        {mergeMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                        {t('crawl.mergeWith')}
                      </Button>
                      <Link
                        to={`/ads/${dup.id}`}
                        target="_blank"
                        className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-text-muted text-xs font-medium hover:bg-white/[0.08] hover:text-text-secondary transition-all"
                      >
                        {t('crawl.viewAd')}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Image gallery */}
          {(() => {
            const images = (currentExtract.images as string[]) ?? (currentAd.summary.thumbnail ? [currentAd.summary.thumbnail] : [])
            if (images.length === 0) return null
            return (
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden mb-4">
                <div className="relative">
                  <img
                    src={images[galleryIdx % images.length]}
                    alt=""
                    className="w-full h-64 md:h-80 object-contain bg-black/40 cursor-pointer"
                    onClick={() => setLightboxOpen(true)}
                  />
                  <button
                    onClick={() => setLightboxOpen(true)}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white/80 hover:text-white hover:bg-black/70 transition-colors backdrop-blur-sm"
                    title={t('common.enlargeImage')}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
                  {images.length > 1 && (
                    <>
                      <button
                        onClick={() => setGalleryIdx((galleryIdx - 1 + images.length) % images.length)}
                        className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/50 text-white/80 hover:text-white hover:bg-black/70 transition-colors backdrop-blur-sm"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => setGalleryIdx((galleryIdx + 1) % images.length)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/50 text-white/80 hover:text-white hover:bg-black/70 transition-colors backdrop-blur-sm"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm text-xs text-white/80 tabular-nums">
                        {(galleryIdx % images.length) + 1} / {images.length}
                      </div>
                    </>
                  )}
                </div>
                {images.length > 1 && (
                  <div className="flex gap-1.5 p-2 overflow-x-auto">
                    {images.map((img, i) => (
                      <button
                        key={i}
                        onClick={() => setGalleryIdx(i)}
                        className={`shrink-0 rounded-md overflow-hidden border-2 transition-all ${i === galleryIdx % images.length ? 'border-amber-400 opacity-100' : 'border-transparent opacity-50 hover:opacity-80'}`}
                      >
                        <img src={img} alt="" className="w-16 h-12 object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Lightbox */}
          {lightboxOpen && (() => {
            const images = (currentExtract.images as string[]) ?? (currentAd.summary.thumbnail ? [currentAd.summary.thumbnail] : [])
            if (images.length === 0) return null
            return (
              <div
                className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center"
                onClick={() => setLightboxOpen(false)}
              >
                <button
                  onClick={() => setLightboxOpen(false)}
                  className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10"
                >
                  <X className="h-6 w-6" />
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm text-sm text-white/80 tabular-nums z-10">
                  {(galleryIdx % images.length) + 1} / {images.length}
                </div>
                {images.length > 1 && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); setGalleryIdx((galleryIdx - 1 + images.length) % images.length) }}
                      className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10"
                    >
                      <ChevronLeft className="h-8 w-8" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setGalleryIdx((galleryIdx + 1) % images.length) }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10"
                    >
                      <ChevronRight className="h-8 w-8" />
                    </button>
                  </>
                )}
                <img
                  src={images[galleryIdx % images.length]}
                  alt=""
                  className="max-h-[90vh] max-w-[90vw] object-contain"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )
          })()}

          {/* Ad title & basic info */}
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 mb-4">
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-text-primary truncate mb-2">
                  {currentExtract.subject as string}
                </h4>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                  <span className="text-text-muted">{t('common.price')}</span>
                  <span className="font-semibold text-amber-300">{formatPrice(currentExtract.price as number)}</span>

                  <span className="text-text-muted">{t('common.year')}</span>
                  <span className="text-text-primary">{(currentExtract.year as number) ?? t('common.na')}</span>

                  <span className="text-text-muted">{t('common.mileage')}</span>
                  <span className="text-text-primary">{(currentExtract.mileage_km as number)?.toLocaleString('fr-FR') ?? t('common.na')} km</span>

                  <span className="text-text-muted">{t('common.location')}</span>
                  <span className="text-text-primary">{currentExtract.city as string ?? '?'}, {currentExtract.department as string ?? '?'}</span>

                  {/* Variante - editable */}
                  <span className="text-text-muted">{t('common.variant')}</span>
                  {editingField === 'variant' ? (
                    <div className="flex flex-wrap gap-1.5">
                      {VARIANTS.map((v) => (
                        <button key={v} onClick={() => updateExtractField('variant', v)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${v === variant ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40' : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08]'}`}>
                          {v}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button onClick={() => setEditingField('variant')} className="flex items-center gap-1.5 group text-left">
                      <Badge className={variantColor(variant)}>{variant ?? t('common.na')}</Badge>
                      <Pencil className="h-3 w-3 text-text-dim opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}

                  {/* Couleur - editable */}
                  <span className="text-text-muted">{t('common.color')}</span>
                  {editingField === 'color' ? (
                    <div className="flex flex-wrap gap-1.5">
                      {availableColors.map((c) => (
                        <button key={c} onClick={() => updateExtractField('color', c)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${c === currentExtract.color ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40' : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08]'}`}>
                          {c}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button onClick={() => setEditingField('color')} className="flex items-center gap-1.5 group text-left">
                      <span className="text-text-primary">{currentExtract.color as string ?? t('common.na')}</span>
                      <Pencil className="h-3 w-3 text-text-dim opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}

                  {/* Jantes - editable */}
                  <span className="text-text-muted">{t('common.wheels')}</span>
                  {editingField === 'wheel_type' ? (
                    <div className="flex gap-1.5">
                      {WHEEL_TYPES.map((w) => (
                        <button key={w} onClick={() => updateExtractField('wheel_type', w)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${w === currentExtract.wheel_type ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40' : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08]'}`}>
                          {w}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button onClick={() => setEditingField('wheel_type')} className="flex items-center gap-1.5 group text-left">
                      <span className="text-text-primary">{currentExtract.wheel_type as string ?? t('common.na')}</span>
                      <Pencil className="h-3 w-3 text-text-dim opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}

                  {currentExtract.estimated_new_price != null && (
                    <>
                      <span className="text-text-muted">{t('common.newRefPrice')}</span>
                      <span className="text-text-primary">{formatPrice(currentExtract.estimated_new_price as number)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Description vendeur */}
          {currentExtract.body != null && (
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] mb-4">
              <button
                onClick={() => setShowDescription(!showDescription)}
                className="w-full flex items-center justify-between p-4 text-left"
              >
                <h4 className="text-[11px] text-text-muted uppercase tracking-widest font-semibold">
                  {t('crawl.sellerDescription')}
                </h4>
                {showDescription ? <ChevronUp className="h-4 w-4 text-text-dim" /> : <ChevronDown className="h-4 w-4 text-text-dim" />}
              </button>
              {showDescription && (
                <div className="px-4 pb-4">
                  <p className="text-sm text-text-secondary whitespace-pre-line leading-relaxed">
                    {currentExtract.body as string}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Diffs warning */}
          {currentAd.existsInDb && currentAd.diffs && currentAd.diffs.length > 0 && (
            <div className="rounded-xl bg-amber-500/5 border border-amber-500/15 p-4 mb-4">
              <h4 className="text-xs uppercase tracking-widest font-semibold text-amber-300 mb-3">
                {t('crawl.dbDifferences')}
              </h4>
              <div className="space-y-2">
                {currentAd.diffs.map((diff) => (
                  <div key={diff.field} className="flex items-start gap-3 text-sm">
                    <span className="text-text-muted w-28 shrink-0">{diff.label}</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-red-400 line-through">{String(diff.old ?? t('common.na'))}</span>
                      <ArrowRight className="h-3 w-3 text-text-dim shrink-0" />
                      <span className="text-green-400">{String(diff.new ?? t('common.na'))}</span>
                    </div>
                    {diff.field === 'accessories' && (
                      <div className="text-xs text-text-dim ml-2">
                        {diff.added && diff.added.length > 0 && (
                          <span className="text-green-400">+{diff.added.join(', ')}</span>
                        )}
                        {diff.added && diff.added.length > 0 && diff.removed && diff.removed.length > 0 && ' / '}
                        {diff.removed && diff.removed.length > 0 && (
                          <span className="text-red-400">-{diff.removed.join(', ')}</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentAd.existsInDb && currentAd.diffs && currentAd.diffs.length === 0 && (
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 mb-4 text-center">
              <p className="text-sm text-text-muted">{t('crawl.noDifferences')}</p>
            </div>
          )}

          {/* Accessories */}
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[11px] text-text-muted uppercase tracking-widest font-semibold">
                {t('adForm.accessories')} ({accessories.length})
              </h4>
              <button
                onClick={() => setShowAddAccessory(!showAddAccessory)}
                className="flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('common.add')}
              </button>
            </div>

            {/* Add accessory search */}
            {showAddAccessory && (
              <div className="mb-3 rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 space-y-2">
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
                      className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg text-sm hover:bg-white/[0.05] transition-colors text-left"
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

            {accessories.length > 0 ? (
              <div className="space-y-1.5">
                {accessories.map((acc, i) => (
                  <div key={acc.name} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/[0.03] group">
                    <CategoryBadge category={acc.category} />
                    <span className="text-sm text-text-primary flex-1">{acc.name}</span>
                    {acc.source === 'manual' && (
                      <span className="text-[10px] text-amber-300/60 uppercase tracking-wide">{t('common.manual')}</span>
                    )}
                    <span className="text-xs text-text-dim">{acc.estimated_new_price} &euro; {t('common.new')}</span>
                    <button onClick={() => removeAccessory(i)}
                      className="p-1 rounded-md text-text-dim opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all"
                      title={t('common.removeAccessory')}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-dim">{t('common.noAccessoryDetected')}</p>
            )}
          </div>

          {/* LBC link */}
          <div className="mb-4">
            <a
              href={currentAd.summary.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-text-dim hover:text-amber-300 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              {t('crawl.viewOnLbc')}
            </a>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
            <Button variant="ghost" onClick={handleSkip} disabled={!!transition || confirmMut.isPending} className="gap-1.5">
              <SkipForward className="h-4 w-4" />
              {t('crawl.skip')}
            </Button>
            <div className="flex gap-3">
              <Button
                onClick={handleConfirm}
                disabled={confirmMut.isPending || !!transition}
                className="gap-1.5"
              >
                {confirmMut.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('common.saving')}
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    {currentAd.existsInDb ? t('crawl.update') : t('common.confirm')}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Transition state — countdown before next extraction */}
      {transition && (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-8 mb-6 text-center">
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4 ${
            transition.type === 'confirmed'
              ? 'bg-green-500/10 border border-green-500/20'
              : 'bg-white/[0.04] border border-white/[0.06]'
          }`}>
            {transition.type === 'confirmed' ? (
              <Check className="h-4 w-4 text-green-400" />
            ) : (
              <SkipForward className="h-4 w-4 text-text-dim" />
            )}
            <span className={`text-sm font-medium ${transition.type === 'confirmed' ? 'text-green-300' : 'text-text-dim'}`}>
              {transition.type === 'confirmed' ? t('crawl.adRegistered') : t('crawl.adSkipped')}
            </span>
          </div>
          <p className="text-xs text-text-dim mb-4 truncate max-w-md mx-auto">
            {transition.subject}
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
            <span>{t('crawl.nextAdIn')} <span className="tabular-nums font-medium text-text-primary">{transition.countdown}s</span></span>
          </div>
          <div className="mt-3 mx-auto max-w-xs h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400/60 rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${((CRAWL_DELAY_MS / 1000 - transition.countdown) / (CRAWL_DELAY_MS / 1000)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Extracting state */}
      {currentAd && currentAd.action === 'extracting' && (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-8 mb-6">
          <div className="flex flex-col items-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-amber-400 mb-3" />
            <p className="text-sm font-medium text-text-primary mb-1">
              {t('crawl.extracting')}
            </p>
            <p className="text-xs text-text-muted mb-3">
              {t('crawl.adCounter', { current: currentIndex + 1, total: adStates.length })}
            </p>
          </div>
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 flex items-center gap-3 max-w-md mx-auto">
            {currentAd.summary.thumbnail && (
              <img src={currentAd.summary.thumbnail} alt="" className="w-16 h-12 rounded-md object-cover shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm text-text-primary truncate">{currentAd.summary.subject}</p>
              <p className="text-xs text-text-dim">
                {[currentAd.summary.price != null && formatPrice(currentAd.summary.price), currentAd.summary.city].filter(Boolean).join(' — ')}
              </p>
            </div>
          </div>
          <p className="text-[11px] text-text-dim text-center mt-3">
            {t('crawl.willBeSubmitted')}
          </p>
        </div>
      )}

      {/* Processed ads list */}
      {processedCount > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowProcessed(!showProcessed)}
            className="flex items-center gap-2 text-sm text-text-muted hover:text-text-secondary transition-colors mb-3"
          >
            {showProcessed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {t('crawl.processedAds')} ({processedCount})
          </button>
          {showProcessed && (
            <div className="space-y-1">
              {adStates
                .filter((s) => s.action !== 'pending' && s.action !== 'extracting' && s.action !== 'waiting')
                .map((state) => (
                  <div
                    key={state.summary.id}
                    className="flex items-center gap-3 py-2 px-3 rounded-lg bg-white/[0.02] text-sm"
                  >
                    {state.action === 'confirmed' && <Check className="h-4 w-4 text-green-400 shrink-0" />}
                    {state.action === 'skipped' && <SkipForward className="h-4 w-4 text-text-dim shrink-0" />}
                    {state.action === 'error' && <X className="h-4 w-4 text-red-400 shrink-0" />}
                    <span className="text-text-primary truncate flex-1">{state.summary.subject}</span>
                    <span className="text-text-dim text-xs shrink-0">
                      {state.summary.price != null ? formatPrice(state.summary.price) : ''}
                    </span>
                    {state.summary.exists_in_db && (
                      <Badge className="bg-amber-500/10 text-amber-300 text-[10px]">{t('crawl.existed')}</Badge>
                    )}
                    {state.potentialDuplicates && state.potentialDuplicates.length > 0 && (
                      <Link to={`/ads/${state.potentialDuplicates[0].id}`} target="_blank">
                        <Badge className="bg-purple-500/10 text-purple-300 text-[10px] hover:bg-purple-500/20 transition-colors">
                          {t('crawl.repostOf', { id: state.potentialDuplicates[0].id })}
                        </Badge>
                      </Link>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Results grid */}
      {status === 'ready' && adStates.length > 0 && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[11px] text-text-muted uppercase tracking-widest font-semibold mb-0.5">
                {t('crawl.searchResults')}
                <span className="ml-1.5 text-text-primary">{t('crawl.new', { count: newCount })}</span>
                {inDbCount > 0 && (
                  <span className="ml-1 text-text-dim font-normal">
                    · {inDbCount} {t('crawl.alreadyInDb')}
                  </span>
                )}
                {newListingCount > 0 && (
                  <span className="ml-1 text-blue-300 font-normal">
                    · {t('crawl.newListingCount', { count: newListingCount })}
                  </span>
                )}
              </h3>
              <p className="text-xs text-text-dim">
                {t('crawl.clickToProcess')}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {newListingCount > 0 && (
                <button
                  onClick={() => setHideNewListings(!hideNewListings)}
                  className="flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary transition-colors"
                >
                  <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${hideNewListings ? 'bg-blue-500/40' : 'bg-white/[0.08]'}`}>
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 mt-0.5 ${hideNewListings ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                  </span>
                  <span className={hideNewListings ? 'text-blue-300' : ''}>
                    {t('crawl.hideNewListings')} ({newListingCount})
                  </span>
                </button>
              )}
              {inDbCount > 0 && (
                <button
                  onClick={() => setShowInDb(!showInDb)}
                  className="flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary transition-colors"
                >
                  <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${showInDb ? 'bg-amber-500/40' : 'bg-white/[0.08]'}`}>
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 mt-0.5 ${showInDb ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                  </span>
                  <span className={showInDb ? 'text-amber-300' : ''}>
                    {t('crawl.showInDb')} ({inDbCount})
                  </span>
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto pr-1">
            {visibleAdStates.map((state) => {
              const index = adStates.indexOf(state)
              const inDb = state.summary.exists_in_db
              const isPending = state.action === 'pending'
              const isWaiting = state.action === 'waiting'
              const isConfirmed = state.action === 'confirmed'
              const isSkipped = state.action === 'skipped'
              const isError = state.action === 'error'
              const isClickable = isPending || isWaiting
              return (
              <div
                key={state.summary.id}
                onClick={() => isClickable && handleManualPick(index)}
                className={`rounded-xl overflow-hidden transition-all group relative ${
                  isClickable ? 'cursor-pointer' : ''
                } ${
                  isConfirmed
                    ? 'bg-green-500/[0.04] border border-green-500/15 opacity-50'
                    : isSkipped
                    ? 'bg-white/[0.01] border border-white/[0.04] opacity-35'
                    : isError
                    ? 'bg-red-500/[0.04] border border-red-500/15 opacity-50'
                    : inDb
                    ? 'bg-amber-500/[0.06] border border-amber-500/20 hover:border-amber-500/30'
                    : 'bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12]'
                }`}
              >
                {/* Status overlay for processed ads */}
                {isConfirmed && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/20 backdrop-blur-sm border border-green-500/30">
                      <Check className="h-4 w-4 text-green-400" />
                      <span className="text-xs font-semibold text-green-300">{t('crawl.added')}</span>
                    </div>
                  </div>
                )}
                {isSkipped && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.08] backdrop-blur-sm border border-white/[0.12]">
                      <SkipForward className="h-4 w-4 text-text-dim" />
                      <span className="text-xs font-semibold text-text-dim">{t('crawl.skippedLabel')}</span>
                    </div>
                  </div>
                )}
                {isError && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/20 backdrop-blur-sm border border-red-500/30">
                      <X className="h-4 w-4 text-red-400" />
                      <span className="text-xs font-semibold text-red-300">{t('common.error')}</span>
                    </div>
                  </div>
                )}
                {isWaiting && (
                  <div className="absolute top-2 right-10 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/20 backdrop-blur-sm border border-amber-500/30">
                    <Pencil className="h-3 w-3 text-amber-400" />
                    <span className="text-[10px] font-semibold text-amber-300 uppercase tracking-wide">{t('crawl.inProgress')}</span>
                  </div>
                )}
                {/* Remove button */}
                {isPending && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setAdStates((prev) => prev.filter((s) => s.summary.id !== state.summary.id))
                    if (sessionId) removeAdMut.mutate({ sessionId, adId: state.summary.id })
                  }}
                  className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/35 hover:text-red-200 transition-colors backdrop-blur-sm"
                  title={t('crawl.removeFromList')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                )}
                {inDb && isPending && (
                  <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/20 backdrop-blur-sm border border-amber-500/30">
                    <AlertTriangle className="h-3 w-3 text-amber-400" />
                    <span className="text-[10px] font-semibold text-amber-300 uppercase tracking-wide">{t('crawl.inDb')}</span>
                  </div>
                )}
                {!inDb && isPending && state.summary.possible_repost_of && (
                  <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-purple-500/20 backdrop-blur-sm border border-purple-500/30">
                    <Copy className="h-3 w-3 text-purple-400" />
                    <span className="text-[10px] font-semibold text-purple-300 uppercase tracking-wide">{t('crawl.repostQuestion')}</span>
                  </div>
                )}
                {state.summary.is_new_listing && isPending && !inDb && !state.summary.possible_repost_of && (
                  <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-blue-500/20 backdrop-blur-sm border border-blue-500/30">
                    <span className="text-[10px] font-semibold text-blue-300 uppercase tracking-wide">{t('crawl.newListingBadge')}</span>
                  </div>
                )}
                {state.summary.thumbnail && (
                  <img src={state.summary.thumbnail} alt="" className={`w-full h-36 object-cover ${!isPending && !isWaiting ? 'opacity-40' : inDb ? 'opacity-70' : ''}`} />
                )}
                <div className="p-3 space-y-2">
                  <p className="text-sm font-medium text-text-primary line-clamp-2 leading-snug">
                    {state.summary.subject}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-amber-300 text-sm font-semibold">
                      {state.summary.price != null ? formatPrice(state.summary.price) : t('common.na')}
                    </span>
                    <span className="text-text-secondary text-xs">
                      {[state.summary.city, state.summary.department].filter(Boolean).join(', ')}
                    </span>
                  </div>
                  {state.summary.price_changed && (
                    <Badge className="bg-amber-500/15 text-amber-300 text-[10px]">
                      {t('crawl.priceChangedBadge')} ({state.summary.price_delta! < 0 ? '' : '+'}{state.summary.price_delta}€)
                    </Badge>
                  )}
                  {isPending && !inDb && state.summary.possible_repost_of && (() => {
                    const repost = state.summary.possible_repost_of
                    const delta = repost.price_delta
                    return (
                      <div className="flex items-center gap-1.5 text-[11px] text-purple-300/80 flex-wrap">
                        <Copy className="h-3 w-3 shrink-0" />
                        <span>{t('crawl.possibleRepost')} </span>
                        <Link to={`/ads/${repost.id}`} target="_blank" className="text-purple-300 underline hover:text-purple-200" onClick={(e) => e.stopPropagation()}>
                          #{repost.id}
                        </Link>
                        {repost.sold && <span className="text-red-400">({t('common.sold').toLowerCase()})</span>}
                        {delta != null && delta !== 0 && (
                          <span className={`font-semibold tabular-nums ${delta < 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {delta < 0 ? '' : '+'}{delta}€
                          </span>
                        )}
                        {delta != null && delta === 0 && (
                          <span className="text-text-dim">{t('crawl.samePrice')}</span>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
