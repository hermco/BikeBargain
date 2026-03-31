import { useState, useEffect, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Loader2, ChevronDown, ChevronUp, Plus, Lightbulb } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { useToast } from './Toast'
import { useCreateCatalogGroup, useUpdateCatalogGroup, useCreateCatalogVariant, useSuggestSynonyms, usePreviewRegex } from '../hooks/queries'
import type { CatalogGroup, PreviewRegexResult, SynonymSuggestion } from '../lib/api'

const CATEGORY_ORDER = ['protection', 'bagagerie', 'confort', 'navigation', 'eclairage', 'esthetique', 'performance', 'autre']

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
          <button type="button" onClick={() => onChange(tags.filter(t => t !== tag))} className="text-text-dim hover:text-ui-red">
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

interface CatalogGroupFormProps {
  group?: CatalogGroup
  onClose: () => void
}

export function CatalogGroupForm({ group, onClose }: CatalogGroupFormProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const isEdit = !!group

  // Group fields
  const [name, setName] = useState(group?.name ?? '')
  const [category, setCategory] = useState(group?.category ?? 'protection')
  const [defaultPrice, setDefaultPrice] = useState(String(group?.default_price ?? ''))
  const [expressions, setExpressions] = useState<string[]>(group?.expressions ?? [])

  // First variant fields (only for create)
  const [variantName, setVariantName] = useState('')
  const [qualifiers, setQualifiers] = useState<string[]>([])
  const [brands, setBrands] = useState<string[]>([])
  const [productAliases, setProductAliases] = useState<string[]>([])
  const [variantPrice, setVariantPrice] = useState('')

  // Advanced variant fields
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [optionalWords, setOptionalWords] = useState<string[]>([])
  const [regexOverride, setRegexOverride] = useState('')
  const [notes, setNotes] = useState('')

  // Suggestions
  const [suggestions, setSuggestions] = useState<SynonymSuggestion[]>([])
  const suggestMut = useSuggestSynonyms()

  // Preview
  const [preview, setPreview] = useState<PreviewRegexResult | null>(null)
  const previewMut = usePreviewRegex()

  // Mutations
  const createGroup = useCreateCatalogGroup()
  const updateGroup = useUpdateCatalogGroup()
  const createVariant = useCreateCatalogVariant()

  const isPending = createGroup.isPending || updateGroup.isPending || createVariant.isPending

  // Fetch suggestions when expressions change
  const fetchSuggestions = useCallback(() => {
    if (expressions.length === 0) {
      setSuggestions([])
      return
    }
    const last = expressions[expressions.length - 1]
    suggestMut.mutate(last, {
      onSuccess: (data) => setSuggestions(data.suggestions),
      onError: () => setSuggestions([]),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expressions])

  useEffect(() => {
    const timer = setTimeout(fetchSuggestions, 500)
    return () => clearTimeout(timer)
  }, [fetchSuggestions])

  // Fetch preview with debounce
  useEffect(() => {
    if (expressions.length === 0) {
      setPreview(null)
      return
    }
    const timer = setTimeout(() => {
      previewMut.mutate(
        {
          group_expressions: expressions,
          qualifiers: qualifiers.length ? qualifiers : undefined,
          brands: brands.length ? brands : undefined,
          product_aliases: productAliases.length ? productAliases : undefined,
          optional_words: optionalWords.length ? optionalWords : undefined,
          regex_override: regexOverride || null,
        },
        {
          onSuccess: (data) => setPreview(data),
          onError: () => setPreview(null),
        },
      )
    }, 800)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expressions, qualifiers, brands, productAliases, optionalWords, regexOverride])

  function addSuggestion(s: SynonymSuggestion) {
    if (!expressions.includes(s.expression)) {
      setExpressions([...expressions, s.expression])
    }
  }

  function handleSave() {
    if (!name.trim()) {
      toast(t('catalog.nameRequired'), 'error')
      return
    }
    if (expressions.length === 0) {
      toast(t('catalog.expressionRequired'), 'error')
      return
    }
    const price = parseInt(defaultPrice, 10)
    if (isNaN(price) || price < 0) {
      toast(t('catalog.priceRequired'), 'error')
      return
    }

    if (isEdit) {
      updateGroup.mutate(
        { id: group.id, name: name.trim(), category, expressions, default_price: price },
        {
          onSuccess: () => {
            toast(t('catalog.editGroup'), 'success')
            onClose()
          },
          onError: (err) => toast((err as Error).message, 'error'),
        },
      )
    } else {
      createGroup.mutate(
        { name: name.trim(), category, expressions, default_price: price },
        {
          onSuccess: (groups) => {
            // Find the newly created group to add the first variant
            const created = groups.find(g => g.name === name.trim())
            if (created && variantName.trim()) {
              const vPrice = parseInt(variantPrice, 10)
              createVariant.mutate(
                {
                  groupId: created.id,
                  name: variantName.trim(),
                  qualifiers: qualifiers.length ? qualifiers : undefined,
                  brands: brands.length ? brands : undefined,
                  product_aliases: productAliases.length ? productAliases : undefined,
                  optional_words: optionalWords.length ? optionalWords : undefined,
                  regex_override: regexOverride || null,
                  estimated_new_price: isNaN(vPrice) ? price : vPrice,
                  notes: notes || null,
                },
                {
                  onSuccess: () => {
                    toast(t('catalog.createGroup'), 'success')
                    onClose()
                  },
                  onError: (err) => toast((err as Error).message, 'error'),
                },
              )
            } else {
              toast(t('catalog.createGroup'), 'success')
              onClose()
            }
          },
          onError: (err) => toast((err as Error).message, 'error'),
        },
      )
    }
  }

  return (
    <Dialog.Root open onOpenChange={(v) => { if (!v) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-md z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-2xl max-h-[85vh] flex flex-col bg-surface border border-tint/[0.08] rounded-2xl z-50 shadow-2xl shadow-black/50">
          <div className="px-7 pt-7 pb-2 shrink-0">
            <Dialog.Title className="text-xl font-semibold text-text-primary font-fraunces">
              {isEdit ? t('catalog.editGroup') : t('catalog.createGroup')}
            </Dialog.Title>
          </div>

          <div className="flex-1 overflow-y-auto px-7 pb-2 space-y-5">
            {/* Section 1: Group info */}
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-muted block mb-1">{t('catalog.groupName')}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl bg-tint/[0.04] border border-tint/[0.08] px-3 py-2.5 text-sm text-text-primary placeholder-text-dim focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-muted block mb-1">{t('catalog.category')}</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-xl bg-tint/[0.04] border border-tint/[0.08] px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all"
                  >
                    {CATEGORY_ORDER.map((cat) => (
                      <option key={cat} value={cat} className="bg-surface text-text-primary">
                        {t(`catalog.categories.${cat}`)} - {t(`catalog.categoryDescriptions.${cat}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-text-muted block mb-1">{t('catalog.defaultPrice')}</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={defaultPrice}
                      onChange={(e) => setDefaultPrice(e.target.value)}
                      className="w-full rounded-xl bg-tint/[0.04] border border-tint/[0.08] px-3 py-2.5 text-sm text-text-primary placeholder-text-dim focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all pr-8"
                      min="0"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim text-xs">&euro;</span>
                  </div>
                </div>
              </div>

              {/* Expressions / synonyms */}
              <div>
                <label className="text-xs text-text-muted block mb-1">
                  {t('catalog.synonyms')}
                  <span className="text-text-dim ml-1">- {t('catalog.synonymsHelp')}</span>
                </label>
                <TagInput
                  tags={expressions}
                  onChange={setExpressions}
                  placeholder={t('catalog.addSynonym')}
                />
              </div>

              {/* Synonym suggestions */}
              {suggestions.length > 0 && (
                <div className="rounded-xl bg-tint/[0.02] border border-tint/[0.06] p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Lightbulb className="h-3.5 w-3.5 text-accent-text" />
                    <span className="text-[11px] text-text-muted uppercase tracking-widest font-semibold">
                      {t('catalog.suggestions')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map((s) => (
                      <button
                        key={s.expression}
                        type="button"
                        onClick={() => addSuggestion(s)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-tint/[0.04] text-xs text-text-secondary hover:bg-tint/[0.08] transition-colors"
                        title={s.context}
                      >
                        <Plus className="h-3 w-3" />
                        {s.expression}
                        <span className="text-text-dim">
                          ({s.rule === 'prefix' ? t('catalog.veryLikely') : t('catalog.possible')})
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Section 2: First variant (create mode only) */}
            {!isEdit && (
              <div className="border-t border-tint/[0.06] pt-4 space-y-3">
                <h3 className="text-[11px] text-text-muted uppercase tracking-widest font-semibold">
                  {t('catalog.createVariant')}
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-text-muted block mb-1">{t('catalog.variantName')}</label>
                    <input
                      type="text"
                      value={variantName}
                      onChange={(e) => setVariantName(e.target.value)}
                      className="w-full rounded-xl bg-tint/[0.04] border border-tint/[0.08] px-3 py-2.5 text-sm text-text-primary placeholder-text-dim focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted block mb-1">{t('catalog.newPrice')}</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={variantPrice}
                        onChange={(e) => setVariantPrice(e.target.value)}
                        placeholder={defaultPrice || '0'}
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

                {/* Advanced collapsible */}
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
              </div>
            )}

            {/* Preview section */}
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
                  <p className="text-xs text-accent-text">{preview.warning}</p>
                )}
              </Card>
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
