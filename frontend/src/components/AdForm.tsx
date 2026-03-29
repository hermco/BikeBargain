import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Plus, Loader2, Link as LinkIcon, Check, Pencil, Trash2, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/Button'
import { CategoryBadge } from './AccessoryBadge'
import { usePreviewAd, useConfirmAd, useAccessoryCatalog } from '../hooks/queries'
import { useToast } from './Toast'
import { variantColor } from '../lib/utils'
import { useFormatters } from '../hooks/useFormatters'
import { Badge } from './ui/Badge'
import type { Accessory, AdDetail } from '../types'
import { useCurrentModel, useVariantOptions } from '../hooks/useCurrentModel'

interface AdFormProps {
  autoOpen?: boolean
  onAutoOpened?: () => void
}

export function AdForm({ autoOpen, onAutoOpened }: AdFormProps) {
  const { t } = useTranslation()
  const { formatPrice } = useFormatters()
  const { slug } = useCurrentModel()
  const { variantNames, wheelTypes, colorsForVariant } = useVariantOptions()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [previewData, setPreviewData] = useState<AdDetail | null>(null)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [galleryIdx, setGalleryIdx] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [showAddAccessory, setShowAddAccessory] = useState(false)
  const [accessorySearch, setAccessorySearch] = useState('')
  const previewMut = usePreviewAd(slug)
  const confirmMut = useConfirmAd(slug)
  const { data: catalog } = useAccessoryCatalog(slug)
  const { toast } = useToast()

  function handleReset() {
    setUrl('')
    setPreviewData(null)
    setEditingField(null)
    setGalleryIdx(0)
    setLightboxOpen(false)
    setShowAddAccessory(false)
    setAccessorySearch('')
    previewMut.reset()
    confirmMut.reset()
  }

  // Auto-open when triggered by query param
  useEffect(() => {
    if (autoOpen && !open) {
      setOpen(true)
      onAutoOpened?.()
    }
  }, [autoOpen, open, onAutoOpened])

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

  function handleClose() {
    handleReset()
    setOpen(false)
  }

  function handleExtract(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    previewMut.mutate(url.trim(), {
      onSuccess: (data) => {
        setPreviewData(data)
      },
      onError: (err) => {
        toast((err as Error).message, 'error')
      },
    })
  }

  function handleConfirm() {
    if (!previewData) return
    confirmMut.mutate(previewData as unknown as Record<string, unknown>, {
      onSuccess: (data) => {
        toast(t('adForm.adAdded', { subject: data.subject ?? 'OK' }), 'success')
        handleClose()
      },
      onError: (err) => {
        toast((err as Error).message, 'error')
      },
    })
  }

  function updateField(field: string, value: unknown) {
    if (!previewData) return
    setPreviewData({ ...previewData, [field]: value } as AdDetail)
    setEditingField(null)
  }

  function removeAccessory(index: number) {
    if (!previewData) return
    const accessories = [...(previewData.accessories as Accessory[])]
    accessories.splice(index, 1)
    setPreviewData({ ...previewData, accessories })
  }

  function addAccessory(acc: { name: string; category: string; estimated_new_price: number; estimated_used_price: number }) {
    if (!previewData) return
    const accessories = [...(previewData.accessories as Accessory[])]
    if (accessories.some((a) => a.name === acc.name)) return
    accessories.push({ ...acc, source: 'manual' })
    setPreviewData({ ...previewData, accessories })
    setShowAddAccessory(false)
    setAccessorySearch('')
  }

  const accessories = (previewData?.accessories ?? []) as Accessory[]
  const images = (previewData?.images as string[]) ?? []
  const variant = previewData?.variant as string | null
  const availableColors = colorsForVariant(variant)
  const catalogFiltered = (catalog ?? []).filter((c) => {
    if (accessories.some((a) => a.name === c.name)) return false
    if (!accessorySearch) return true
    const q = accessorySearch.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
  })

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true) }}>
      <Dialog.Trigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          {t('adForm.addUrl')}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-md z-40" />
        <Dialog.Content className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] ${previewData ? 'max-w-4xl' : 'max-w-2xl'} max-h-[85vh] flex flex-col bg-surface border border-white/[0.08] rounded-2xl z-50 shadow-2xl shadow-black/50`}>
          {/* Header (non-scrolling) */}
          <div className="px-7 pt-7 pb-2 shrink-0">
            <Dialog.Title className="text-xl font-semibold text-text-primary mb-1 font-fraunces">
              {previewData ? t('adForm.verifyExtraction') : t('adForm.addAd')}
            </Dialog.Title>
          </div>

          {/* Step 1: URL input */}
          {!previewData && (
            <div className="px-7 pb-7">
              <p className="text-sm text-text-muted mb-6">{t('adForm.pasteInstruction')}</p>
              <form onSubmit={handleExtract} className="space-y-5">
                <div className="relative">
                  <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-dim" />
                  <input
                    type="url"
                    placeholder="https://www.leboncoin.fr/..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] pl-10 pr-4 py-3 text-sm text-text-primary placeholder-text-dim focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/30 transition-all"
                    required
                    autoFocus
                  />
                </div>
                {previewMut.error && (
                  <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                    {(previewMut.error as Error).message}
                  </div>
                )}
                <div className="flex justify-end gap-3 pt-1">
                  <Dialog.Close asChild>
                    <Button type="button" variant="ghost">{t('common.cancel')}</Button>
                  </Dialog.Close>
                  <Button type="submit" disabled={previewMut.isPending}>
                    {previewMut.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        {t('adForm.extracting')}
                      </>
                    ) : (
                      t('adForm.extract')
                    )}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Step 2: Preview & confirm */}
          {previewData && (
            <>
            <div className="flex-1 overflow-y-auto px-7 space-y-5">
              <p className="text-sm text-text-muted">{t('adForm.verifyInstruction')}</p>

              {/* Image gallery */}
              {images.length > 0 && (
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
                  <div className="relative">
                    <img
                      src={images[((galleryIdx % images.length) + images.length) % images.length]}
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
                          {(((galleryIdx % images.length) + images.length) % images.length) + 1} / {images.length}
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
                          className={`shrink-0 rounded-md overflow-hidden border-2 transition-all ${i === ((galleryIdx % images.length) + images.length) % images.length ? 'border-amber-400 opacity-100' : 'border-transparent opacity-50 hover:opacity-80'}`}
                        >
                          <img src={img} alt="" className="w-16 h-12 object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Lightbox */}
              {lightboxOpen && images.length > 0 && (
                <div
                  className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center"
                  onClick={() => setLightboxOpen(false)}
                >
                  <button
                    onClick={() => setLightboxOpen(false)}
                    className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10"
                  >
                    <X className="h-6 w-6" />
                  </button>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm text-sm text-white/80 tabular-nums z-10">
                    {(((galleryIdx % images.length) + images.length) % images.length) + 1} / {images.length}
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
                    src={images[((galleryIdx % images.length) + images.length) % images.length]}
                    alt=""
                    className="max-h-[90vh] max-w-[90vw] object-contain"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}

              {/* Main info */}
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-3">
                <h3 className="text-sm font-semibold text-text-primary truncate">{previewData.subject as string}</h3>
                <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 text-sm">
                  <span className="text-text-muted">{t('common.price')}</span>
                  <span className="font-semibold text-amber-300">{formatPrice(previewData.price as number)}</span>

                  <span className="text-text-muted">{t('common.year')}</span>
                  <span className="text-text-primary">{(previewData.year as number) ?? t('common.na')}</span>

                  <span className="text-text-muted">{t('common.mileage')}</span>
                  <span className="text-text-primary">{(previewData.mileage_km as number)?.toLocaleString('fr-FR') ?? t('common.na')} km</span>

                  <span className="text-text-muted">{t('common.location')}</span>
                  <span className="text-text-primary">{(previewData.city as string) ?? '?'}, {(previewData.department as string) ?? '?'}</span>

                  {/* Variante - editable */}
                  <span className="text-text-muted">{t('common.variant')}</span>
                  {editingField === 'variant' ? (
                    <div className="flex flex-wrap gap-1.5">
                      {variantNames.map((v) => (
                        <button key={v} onClick={() => updateField('variant', v)}
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
                        <button key={c} onClick={() => updateField('color', c)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${c === previewData.color ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40' : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08]'}`}>
                          {c}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button onClick={() => setEditingField('color')} className="flex items-center gap-1.5 group text-left">
                      <span className="text-text-primary">{(previewData.color as string) ?? t('common.na')}</span>
                      <Pencil className="h-3 w-3 text-text-dim opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}

                  {/* Jantes - editable */}
                  <span className="text-text-muted">{t('common.wheels')}</span>
                  {editingField === 'wheel_type' ? (
                    <div className="flex gap-1.5">
                      {wheelTypes.map((w) => (
                        <button key={w} onClick={() => updateField('wheel_type', w)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${w === previewData.wheel_type ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40' : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08]'}`}>
                          {w}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button onClick={() => setEditingField('wheel_type')} className="flex items-center gap-1.5 group text-left">
                      <span className="text-text-primary">{(previewData.wheel_type as string) ?? t('common.na')}</span>
                      <Pencil className="h-3 w-3 text-text-dim opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}

                  {previewData.estimated_new_price != null && (
                    <>
                      <span className="text-text-muted">{t('common.newRefPrice')}</span>
                      <span className="text-text-primary">{formatPrice(previewData.estimated_new_price as number)}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Accessories */}
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[11px] text-text-muted uppercase tracking-widest font-semibold">
                    {t('adForm.accessories')} ({accessories.length})
                  </h3>
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

              {/* Errors */}
              {confirmMut.error && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                  {(confirmMut.error as Error).message}
                </div>
              )}
            </div>

            {/* Sticky footer with actions */}
            <div className="sticky bottom-0 shrink-0 px-7 py-4 bg-surface border-t border-white/[0.06] rounded-b-2xl">
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <Button variant="ghost" onClick={handleReset}>
                  {t('common.reset')}
                </Button>
                <div className="flex gap-3 justify-end">
                  <Button variant="ghost" onClick={handleClose}>{t('common.cancel')}</Button>
                  <Button onClick={handleConfirm} disabled={confirmMut.isPending} className="gap-2">
                    {confirmMut.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('common.saving')}
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        {t('common.confirm')}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
            </>
          )}

          <Dialog.Close asChild>
            <button onClick={handleClose} className="absolute top-5 right-5 text-text-dim hover:text-text-secondary transition-colors" aria-label={t('common.close')}>
              <X className="h-5 w-5" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
