import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Loader2, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { useToast } from './Toast'
import { useCreateCatalogVariant, useUpdateCatalogVariant, useDeleteCatalogVariant, usePreviewRegex, usePreviewDiff } from '../hooks/queries'
import type { CatalogGroup, CatalogVariant, PreviewRegexResult, PreviewDiffResult } from '../lib/api'

function TagInput({ tags, onChange, placeholder }: { tags: string[]; onChange: (tags: string[]) => void; placeholder: string }) {
  const [input, setInput] = useState('')
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault()
      if (!tags.includes(input.trim())) onChange([...tags, input.trim()])
      setInput('')
    }
    if (e.key === 'Backspace' && !input && tags.length) {
      onChange(tags.slice(0, -1))
    }
  }
  return (
    <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-tint/[0.04] border border-tint/[0.08] min-h-[42px] focus-within:ring-2 focus-within:ring-amber-500/30">
      {tags.map(tag => (
        <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-tint/[0.08] text-xs text-text-secondary">
          {tag}
          <button type="button" onClick={() => onChange(tags.filter(t => t !== tag))} className="text-text-dim hover:text-red-400">
            &times;
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[80px] bg-transparent text-sm text-text-primary placeholder-text-dim outline-none"
      />
    </div>
  )
}

interface CatalogVariantFormProps {
  groupId: number
  group: CatalogGroup
  variant?: CatalogVariant
  onClose: () => void
}

export function CatalogVariantForm({ groupId, group, variant, onClose }: CatalogVariantFormProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const isEdit = !!variant

  const [name, setName] = useState(variant?.name ?? '')
  const [qualifiers, setQualifiers] = useState<string[]>(variant?.qualifiers ?? [])
  const [brands, setBrands] = useState<string[]>(variant?.brands ?? [])
  const [productAliases, setProductAliases] = useState<string[]>(variant?.product_aliases ?? [])
  const [price, setPrice] = useState(String(variant?.estimated_new_price ?? group.default_price))
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [optionalWords, setOptionalWords] = useState<string[]>(variant?.optional_words ?? [])
  const [regexOverride, setRegexOverride] = useState(variant?.regex_override ?? '')
  const [notes, setNotes] = useState(variant?.notes ?? '')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Preview
  const [preview, setPreview] = useState<PreviewRegexResult | null>(null)
  const [diff, setDiff] = useState<PreviewDiffResult | null>(null)
  const previewMut = usePreviewRegex()
  const diffMut = usePreviewDiff()

  const createVariant = useCreateCatalogVariant()
  const updateVariant = useUpdateCatalogVariant()
  const deleteVariant = useDeleteCatalogVariant()

  const isPending = createVariant.isPending || updateVariant.isPending || deleteVariant.isPending

  // Debounced preview
  useEffect(() => {
    const timer = setTimeout(() => {
      const payload = {
        group_expressions: group.expressions,
        qualifiers: qualifiers.length ? qualifiers : undefined,
        brands: brands.length ? brands : undefined,
        product_aliases: productAliases.length ? productAliases : undefined,
        optional_words: optionalWords.length ? optionalWords : undefined,
        regex_override: regexOverride || null,
      }
      previewMut.mutate(payload, {
        onSuccess: (data) => setPreview(data),
        onError: () => setPreview(null),
      })

      if (isEdit && variant) {
        diffMut.mutate(
          { variant_id: variant.id, ...payload },
          {
            onSuccess: (data) => setDiff(data),
            onError: () => setDiff(null),
          },
        )
      }
    }, 800)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qualifiers, brands, productAliases, optionalWords, regexOverride])

  function handleSave() {
    if (!name.trim()) {
      toast(t('catalog.nameRequired'), 'error')
      return
    }
    const parsedPrice = parseInt(price, 10)
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      toast(t('catalog.priceRequired'), 'error')
      return
    }

    const data = {
      name: name.trim(),
      qualifiers: qualifiers.length ? qualifiers : [],
      brands: brands.length ? brands : [],
      product_aliases: productAliases.length ? productAliases : [],
      optional_words: optionalWords.length ? optionalWords : [],
      regex_override: regexOverride || null,
      estimated_new_price: parsedPrice,
      notes: notes || null,
    }

    if (isEdit) {
      updateVariant.mutate(
        { id: variant.id, ...data },
        {
          onSuccess: () => {
            toast(t('catalog.editVariant'), 'success')
            onClose()
          },
          onError: (err) => toast((err as Error).message, 'error'),
        },
      )
    } else {
      createVariant.mutate(
        { groupId, ...data },
        {
          onSuccess: () => {
            toast(t('catalog.createVariant'), 'success')
            onClose()
          },
          onError: (err) => toast((err as Error).message, 'error'),
        },
      )
    }
  }

  function handleDelete() {
    if (!variant) return
    deleteVariant.mutate(variant.id, {
      onSuccess: () => {
        toast(t('catalog.deleteVariant'), 'success')
        onClose()
      },
      onError: (err) => toast((err as Error).message, 'error'),
    })
  }

  return (
    <Dialog.Root open onOpenChange={(v) => { if (!v) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-md z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-2xl max-h-[85vh] flex flex-col bg-surface border border-tint/[0.08] rounded-2xl z-50 shadow-2xl shadow-black/50">
          <div className="px-7 pt-7 pb-2 shrink-0">
            <Dialog.Title className="text-xl font-semibold text-text-primary font-fraunces">
              {isEdit ? t('catalog.editVariant') : t('catalog.createVariant')}
            </Dialog.Title>
            <p className="text-sm text-text-muted mt-1">{group.name}</p>
          </div>

          <div className="flex-1 overflow-y-auto px-7 pb-2 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-muted block mb-1">{t('catalog.variantName')}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl bg-tint/[0.04] border border-tint/[0.08] px-3 py-2.5 text-sm text-text-primary placeholder-text-dim focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">{t('catalog.newPrice')}</label>
                <div className="relative">
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full rounded-xl bg-tint/[0.04] border border-tint/[0.08] px-3 py-2.5 text-sm text-text-primary placeholder-text-dim focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all pr-8"
                    min="0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim text-xs">&euro;</span>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs text-text-muted block mb-1">
                {t('catalog.keywords')}
                <span className="text-text-dim ml-1">- {t('catalog.keywordsHelp')}</span>
              </label>
              <TagInput tags={qualifiers} onChange={setQualifiers} placeholder={t('catalog.keywords')} />
            </div>

            <div>
              <label className="text-xs text-text-muted block mb-1">
                {t('catalog.brands')}
                <span className="text-text-dim ml-1">- {t('catalog.brandsHelp')}</span>
              </label>
              <TagInput tags={brands} onChange={setBrands} placeholder={t('catalog.brands')} />
            </div>

            <div>
              <label className="text-xs text-text-muted block mb-1">
                {t('catalog.productNames')}
                <span className="text-text-dim ml-1">- {t('catalog.productNamesHelp')}</span>
              </label>
              <TagInput tags={productAliases} onChange={setProductAliases} placeholder={t('catalog.productNames')} />
            </div>

            {/* Advanced */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {t('catalog.advanced')}
            </button>

            {showAdvanced && (
              <div className="space-y-3 pl-2 border-l-2 border-tint/[0.06]">
                <div>
                  <label className="text-xs text-text-muted block mb-1">
                    {t('catalog.optionalWords')}
                    <span className="text-text-dim ml-1">- {t('catalog.optionalWordsHelp')}</span>
                  </label>
                  <TagInput tags={optionalWords} onChange={setOptionalWords} placeholder={t('catalog.optionalWords')} />
                </div>
                <div>
                  <label className="text-xs text-text-muted block mb-1">
                    {t('catalog.regexOverride')}
                    <span className="text-text-dim ml-1">- {t('catalog.regexOverrideHelp')}</span>
                  </label>
                  <input
                    type="text"
                    value={regexOverride}
                    onChange={(e) => setRegexOverride(e.target.value)}
                    className="w-full rounded-xl bg-tint/[0.04] border border-tint/[0.08] px-3 py-2.5 text-sm text-text-primary font-mono placeholder-text-dim focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs text-text-muted block mb-1">
                    {t('catalog.notes')}
                    <span className="text-text-dim ml-1">- {t('catalog.notesHelp')}</span>
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full rounded-xl bg-tint/[0.04] border border-tint/[0.08] px-3 py-2.5 text-sm text-text-primary placeholder-text-dim focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all resize-none"
                  />
                </div>
              </div>
            )}

            {/* Preview */}
            {preview && (
              <Card className="p-4 space-y-2">
                <h4 className="text-[11px] text-text-muted uppercase tracking-widest font-semibold">
                  {t('catalog.preview')}
                </h4>
                <div>
                  <span className="text-xs text-text-dim">{t('catalog.previewRegex')}</span>
                  <code className="block mt-1 text-xs font-mono text-accent-text/80 bg-tint/[0.03] rounded-lg p-2 break-all">
                    {preview.generated_regex}
                  </code>
                </div>
                <div className="text-xs text-text-secondary">
                  {t('catalog.matchingAds')}: <span className="font-semibold">{preview.matching_ads_count}</span>
                </div>
                {preview.matching_ads_sample.length > 0 && (
                  <div className="space-y-1">
                    {preview.matching_ads_sample.slice(0, 5).map((ad) => (
                      <div key={ad.id} className="text-xs text-text-dim flex gap-2">
                        <span className="text-text-muted">#{ad.id}</span>
                        <span className="truncate">{ad.title}</span>
                        <span className="text-accent-text/60 font-mono shrink-0">{ad.matched_text}</span>
                      </div>
                    ))}
                  </div>
                )}
                {preview.warning && (
                  <p className="text-xs text-amber-400">{preview.warning}</p>
                )}
              </Card>
            )}

            {/* Diff (edit mode) */}
            {diff && (diff.gained.length > 0 || diff.lost.length > 0) && (
              <Card className="p-4 space-y-2">
                <h4 className="text-[11px] text-text-muted uppercase tracking-widest font-semibold">
                  {t('catalog.previewDiff')}
                </h4>
                {diff.gained.length > 0 && (
                  <div>
                    <span className="text-xs text-emerald-400">{t('catalog.gained')} (+{diff.gained.length})</span>
                    <div className="mt-1 space-y-0.5">
                      {diff.gained.slice(0, 5).map((ad) => (
                        <div key={ad.id} className="text-xs text-text-dim">
                          <span className="text-text-muted">#{ad.id}</span> {ad.title}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {diff.lost.length > 0 && (
                  <div>
                    <span className="text-xs text-red-400">
                      {t('catalog.lostWarning', { count: diff.lost.length })}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {diff.lost.slice(0, 5).map((ad) => (
                        <div key={ad.id} className="text-xs text-text-dim">
                          <span className="text-text-muted">#{ad.id}</span> {ad.title}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* Delete confirmation for existing variants */}
            {isEdit && variant && (
              <div className="border-t border-tint/[0.06] pt-4">
                {showDeleteConfirm ? (
                  <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-4 space-y-2">
                    <p className="text-sm text-red-400">
                      {t('catalog.deleteVariantConfirm', { name: variant.name })}
                    </p>
                    {group.variants.length <= 1 && (
                      <p className="text-xs text-amber-400">{t('catalog.deleteVariantLastWarning')}</p>
                    )}
                    <div className="flex gap-2">
                      <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleteVariant.isPending}>
                        {deleteVariant.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                        )}
                        {t('common.delete')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-1.5 text-xs text-red-400/60 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t('catalog.deleteVariant')}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 px-7 py-4 bg-surface border-t border-tint/[0.06] rounded-b-2xl">
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={onClose} disabled={isPending}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSave} disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {t('catalog.saving')}
                  </>
                ) : (
                  t('common.save')
                )}
              </Button>
            </div>
          </div>

          <Dialog.Close asChild>
            <button
              onClick={onClose}
              className="absolute top-5 right-5 text-text-dim hover:text-text-secondary transition-colors"
              aria-label={t('common.close')}
            >
              <X className="h-5 w-5" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
