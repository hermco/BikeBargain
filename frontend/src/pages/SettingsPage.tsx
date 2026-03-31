import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, Trash2, Save, X, Search, MapPin, SortAsc, ChevronDown, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { useCurrentModel } from '../hooks/useCurrentModel'
import { useToast } from '../components/Toast'
import {
  useSearchConfigs,
  useCreateSearchConfig,
  useUpdateSearchConfig,
  useDeleteSearchConfig,
  useLbcEnums,
} from '../hooks/queries'
import type { SearchConfig, LbcEnums } from '../types'

/* ---------- helpers ---------- */

const EMPTY_FORM: Omit<SearchConfig, 'id'> = {
  keyword: '',
  min_cc: null,
  max_cc: null,
  locations: null,
  owner_type: null,
  price_min: null,
  price_max: null,
  sort: null,
  search_in_title_only: false,
}

function FilterBadge({ children }: { children: React.ReactNode }) {
  return (
    <Badge className="bg-tint/[0.05] text-text-dim ring-1 ring-tint/[0.08]">
      {children}
    </Badge>
  )
}

/* ---------- Locations multi-select ---------- */

function LocationsSelect({
  value,
  onChange,
  enums,
}: {
  value: string[] | null
  onChange: (v: string[] | null) => void
  enums: LbcEnums
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set())

  const selected = new Set(value ?? [])

  // Group departments by region
  const grouped = useMemo(() => {
    const map: Record<string, { value: string; label: string; code: string }[]> = {}
    for (const dept of enums.departments) {
      ;(map[dept.region] ??= []).push(dept)
    }
    return map
  }, [enums.departments])

  const regionNames = useMemo(() => Object.keys(grouped).sort(), [grouped])

  function toggleDept(deptValue: string) {
    const next = new Set(selected)
    if (next.has(deptValue)) next.delete(deptValue)
    else next.add(deptValue)
    onChange(next.size > 0 ? [...next] : null)
  }

  function toggleRegion(region: string) {
    const depts = grouped[region]
    const allSelected = depts.every((d) => selected.has(d.value))
    const next = new Set(selected)
    for (const d of depts) {
      if (allSelected) next.delete(d.value)
      else next.add(d.value)
    }
    onChange(next.size > 0 ? [...next] : null)
  }

  function toggleRegionExpand(region: string) {
    setExpandedRegions((prev) => {
      const next = new Set(prev)
      if (next.has(region)) next.delete(region)
      else next.add(region)
      return next
    })
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-tint/[0.04] border border-tint/[0.08] text-sm text-text-secondary hover:border-tint/[0.12] transition-colors text-left"
      >
        <span className={selected.size === 0 ? 'text-text-dim' : ''}>
          {selected.size === 0
            ? t('settings.searchConfig.locationsPlaceholder')
            : `${selected.size} ${t('settings.searchConfig.locations').toLowerCase()}`}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-text-dim transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-tint/[0.08] bg-surface/95 backdrop-blur-xl shadow-2xl shadow-black/40"
          >
            <div className="p-1">
              {regionNames.map((region) => {
                const depts = grouped[region]
                const allChecked = depts.every((d) => selected.has(d.value))
                const someChecked = depts.some((d) => selected.has(d.value))
                const isExpanded = expandedRegions.has(region)

                return (
                  <div key={region}>
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-tint/[0.04] cursor-pointer">
                      <button
                        type="button"
                        onClick={() => toggleRegionExpand(region)}
                        className="p-0.5 text-text-dim"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                      </button>
                      <label className="flex items-center gap-2 flex-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked }}
                          onChange={() => toggleRegion(region)}
                          className="accent-amber-500 rounded"
                        />
                        <span className="text-xs font-semibold text-text-secondary">{region}</span>
                      </label>
                    </div>
                    {isExpanded && (
                      <div className="pl-7 pb-1">
                        {depts.map((dept) => (
                          <label
                            key={dept.value}
                            className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-tint/[0.03] cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(dept.value)}
                              onChange={() => toggleDept(dept.value)}
                              className="accent-amber-500 rounded"
                            />
                            <span className="text-xs text-text-muted">
                              {dept.code} - {dept.label}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ---------- Config form ---------- */

function ConfigForm({
  initial,
  enums,
  onSave,
  onCancel,
  isSaving,
}: {
  initial: Omit<SearchConfig, 'id'>
  enums: LbcEnums
  onSave: (data: Omit<SearchConfig, 'id'>) => void
  onCancel: () => void
  isSaving: boolean
}) {
  const { t } = useTranslation()
  const [form, setForm] = useState<Omit<SearchConfig, 'id'>>(initial)

  function set<K extends keyof Omit<SearchConfig, 'id'>>(key: K, value: Omit<SearchConfig, 'id'>[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave(form)
  }

  return (
    <motion.form
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      onSubmit={handleSubmit}
      className="overflow-hidden"
    >
      <div className="space-y-4 p-4">
        {/* Keyword */}
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">
            {t('settings.searchConfig.keyword')} *
          </label>
          <input
            type="text"
            required
            value={form.keyword}
            onChange={(e) => set('keyword', e.target.value)}
            placeholder={t('settings.searchConfig.keywordPlaceholder')}
            className="w-full px-3 py-2 rounded-lg bg-tint/[0.04] border border-tint/[0.08] text-sm text-text-primary placeholder-text-dim focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-colors"
          />
        </div>

        {/* CC range */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">
              {t('settings.searchConfig.minCc')}
            </label>
            <input
              type="number"
              value={form.min_cc ?? ''}
              onChange={(e) => set('min_cc', e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 rounded-lg bg-tint/[0.04] border border-tint/[0.08] text-sm text-text-primary placeholder-text-dim focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">
              {t('settings.searchConfig.maxCc')}
            </label>
            <input
              type="number"
              value={form.max_cc ?? ''}
              onChange={(e) => set('max_cc', e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 rounded-lg bg-tint/[0.04] border border-tint/[0.08] text-sm text-text-primary placeholder-text-dim focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-colors"
            />
          </div>
        </div>

        {/* Locations */}
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">
            {t('settings.searchConfig.locations')}
          </label>
          <LocationsSelect
            value={form.locations}
            onChange={(v) => set('locations', v)}
            enums={enums}
          />
        </div>

        {/* Owner type */}
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">
            {t('settings.searchConfig.ownerType')}
          </label>
          <select
            value={form.owner_type ?? ''}
            onChange={(e) => set('owner_type', e.target.value || null)}
            className="w-full px-3 py-2 rounded-lg bg-tint/[0.04] border border-tint/[0.08] text-sm text-text-primary focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-colors"
          >
            <option value="">{t('settings.searchConfig.ownerTypeOptions.all')}</option>
            {enums.owner_types.map((ot) => (
              <option key={ot.value} value={ot.value}>
                {ot.label}
              </option>
            ))}
          </select>
        </div>

        {/* Price range */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">
              {t('settings.searchConfig.priceMin')}
            </label>
            <input
              type="number"
              value={form.price_min ?? ''}
              onChange={(e) => set('price_min', e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 rounded-lg bg-tint/[0.04] border border-tint/[0.08] text-sm text-text-primary placeholder-text-dim focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">
              {t('settings.searchConfig.priceMax')}
            </label>
            <input
              type="number"
              value={form.price_max ?? ''}
              onChange={(e) => set('price_max', e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 rounded-lg bg-tint/[0.04] border border-tint/[0.08] text-sm text-text-primary placeholder-text-dim focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-colors"
            />
          </div>
        </div>

        {/* Sort */}
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">
            {t('settings.searchConfig.sort')}
          </label>
          <select
            value={form.sort ?? ''}
            onChange={(e) => set('sort', e.target.value || null)}
            className="w-full px-3 py-2 rounded-lg bg-tint/[0.04] border border-tint/[0.08] text-sm text-text-primary focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-colors"
          >
            <option value="">—</option>
            {enums.sorts.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Search in title only */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.search_in_title_only}
            onChange={(e) => set('search_in_title_only', e.target.checked)}
            className="accent-amber-500 rounded"
          />
          <span className="text-sm text-text-secondary">
            {t('settings.searchConfig.searchInTitleOnly')}
          </span>
        </label>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button type="submit" size="sm" disabled={isSaving || !form.keyword.trim()} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {t('common.save')}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="gap-1.5">
            <X className="h-3.5 w-3.5" />
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </motion.form>
  )
}

/* ---------- Config card ---------- */

function ConfigCard({
  config,
  enums,
  onEdit,
  onDelete,
  isDeleting,
}: {
  config: SearchConfig
  enums: LbcEnums | undefined
  onEdit: () => void
  onDelete: () => void
  isDeleting: boolean
}) {
  const { t } = useTranslation()

  const ownerLabel = config.owner_type
    ? enums?.owner_types.find((ot) => ot.value === config.owner_type)?.label ?? config.owner_type
    : null

  const sortLabel = config.sort
    ? enums?.sorts.find((s) => s.value === config.sort)?.label ?? config.sort
    : null

  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-tint/[0.015] transition-colors group">
      <Search className="h-4 w-4 text-text-dim shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-text-primary">{config.keyword}</span>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {config.min_cc != null && config.max_cc != null && (
            <FilterBadge>
              {t('settings.searchConfig.ccRange', { min: config.min_cc, max: config.max_cc })}
            </FilterBadge>
          )}
          {config.min_cc != null && config.max_cc == null && (
            <FilterBadge>&ge; {config.min_cc} cc</FilterBadge>
          )}
          {config.min_cc == null && config.max_cc != null && (
            <FilterBadge>&le; {config.max_cc} cc</FilterBadge>
          )}
          {config.locations && config.locations.length > 0 && (
            <FilterBadge>
              <MapPin className="h-3 w-3 mr-0.5" />
              {config.locations.length}
            </FilterBadge>
          )}
          {ownerLabel && <FilterBadge>{ownerLabel}</FilterBadge>}
          {config.price_min != null && config.price_max != null && (
            <FilterBadge>
              {t('settings.searchConfig.priceRange', { min: config.price_min, max: config.price_max })}
            </FilterBadge>
          )}
          {config.price_min != null && config.price_max == null && (
            <FilterBadge>&ge; {config.price_min} EUR</FilterBadge>
          )}
          {config.price_min == null && config.price_max != null && (
            <FilterBadge>&le; {config.price_max} EUR</FilterBadge>
          )}
          {sortLabel && (
            <FilterBadge>
              <SortAsc className="h-3 w-3 mr-0.5" />
              {sortLabel}
            </FilterBadge>
          )}
          {config.search_in_title_only && (
            <FilterBadge>{t('settings.searchConfig.searchInTitleOnly')}</FilterBadge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg text-text-dim hover:text-text-secondary hover:bg-tint/[0.06] transition-colors"
          title={t('common.edit')}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="p-1.5 rounded-lg text-text-dim hover:text-ui-red hover:bg-red-500/10 transition-colors disabled:opacity-40"
          title={t('common.delete')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

/* ---------- Main page ---------- */

export function SettingsPage() {
  const { slug } = useCurrentModel()
  const { t } = useTranslation()
  const { toast } = useToast()

  const { data: configs, isLoading } = useSearchConfigs(slug)
  const { data: enums } = useLbcEnums()
  const createMut = useCreateSearchConfig(slug)
  const updateMut = useUpdateSearchConfig(slug)
  const deleteMut = useDeleteSearchConfig(slug)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  function handleCreate(data: Omit<SearchConfig, 'id'>) {
    createMut.mutate(data, {
      onSuccess: () => {
        toast('OK', 'success')
        setShowCreate(false)
      },
      onError: (err) => toast((err as Error).message, 'error'),
    })
  }

  function handleUpdate(id: number, data: Omit<SearchConfig, 'id'>) {
    updateMut.mutate(
      { id, data },
      {
        onSuccess: () => {
          toast('OK', 'success')
          setEditingId(null)
        },
        onError: (err) => toast((err as Error).message, 'error'),
      },
    )
  }

  function handleDelete(id: number) {
    if (deletingId === id) {
      deleteMut.mutate(id, {
        onSuccess: () => {
          toast('OK', 'success')
          setDeletingId(null)
        },
        onError: (err) => toast((err as Error).message, 'error'),
      })
    } else {
      setDeletingId(id)
      setTimeout(() => setDeletingId((prev) => (prev === id ? null : prev)), 3000)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text-primary font-fraunces">
          {t('settings.title')}
        </h1>
        <p className="text-sm text-text-muted mt-1">
          {t('settings.searchConfig.subtitle')}
        </p>
      </div>

      {/* Search configs section */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3 px-2">
          <Search className="h-4 w-4 text-accent-text" />
          <h2 className="text-sm font-semibold text-text-primary">
            {t('settings.searchConfig.title')}
          </h2>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3 px-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-tint/[0.03] animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {configs && configs.length === 0 && !showCreate && (
          <div className="text-center py-8">
            <Search className="h-8 w-8 text-text-dim mx-auto mb-2" />
            <p className="text-sm text-text-muted">{t('settings.searchConfig.emptyState')}</p>
          </div>
        )}

        {/* Config list */}
        {configs && configs.length > 0 && (
          <div className="divide-y divide-tint/[0.04]">
            {configs.map((config) =>
              editingId === config.id && enums ? (
                <ConfigForm
                  key={config.id}
                  initial={{
                    keyword: config.keyword,
                    min_cc: config.min_cc,
                    max_cc: config.max_cc,
                    locations: config.locations,
                    owner_type: config.owner_type,
                    price_min: config.price_min,
                    price_max: config.price_max,
                    sort: config.sort,
                    search_in_title_only: config.search_in_title_only,
                  }}
                  enums={enums}
                  onSave={(data) => handleUpdate(config.id, data)}
                  onCancel={() => setEditingId(null)}
                  isSaving={updateMut.isPending}
                />
              ) : (
                <ConfigCard
                  key={config.id}
                  config={config}
                  enums={enums}
                  onEdit={() => setEditingId(config.id)}
                  onDelete={() => handleDelete(config.id)}
                  isDeleting={deletingId === config.id && deleteMut.isPending}
                />
              ),
            )}
          </div>
        )}

        {/* Create form */}
        <AnimatePresence>
          {showCreate && enums && (
            <ConfigForm
              initial={EMPTY_FORM}
              enums={enums}
              onSave={handleCreate}
              onCancel={() => setShowCreate(false)}
              isSaving={createMut.isPending}
            />
          )}
        </AnimatePresence>

        {/* Add button */}
        {!showCreate && (
          <div className="mt-3 px-2">
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 text-xs text-accent-text/70 hover:text-accent-text transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('settings.searchConfig.addConfig')}
            </button>
          </div>
        )}
      </Card>

      {/* Delete confirmation toast */}
      <AnimatePresence>
        {deletingId && !deleteMut.isPending && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/10 backdrop-blur-xl shadow-2xl shadow-black/40"
          >
            <Trash2 className="h-4 w-4 text-ui-red" />
            <span className="text-sm font-medium text-text-primary">
              {t('settings.searchConfig.deleteConfirm')}
            </span>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (deletingId) handleDelete(deletingId)
              }}
            >
              {t('common.confirm')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDeletingId(null)}>
              {t('common.cancel')}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
