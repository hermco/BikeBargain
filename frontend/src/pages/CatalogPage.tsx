import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, RefreshCw, Download, Upload, RotateCcw, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { CategoryBadge } from '../components/AccessoryBadge'
import { useCurrentModel } from '../hooks/useCurrentModel'
import { useToast } from '../components/Toast'
import { useFormatters } from '../hooks/useFormatters'
import {
  useCatalogGroups,
  useDeleteCatalogGroup,
  useRefreshAllAccessories,
  useRefreshStatus,
  useResetCatalog,
  useExportCatalog,
  useImportCatalog,
} from '../hooks/queries'
import { CatalogTestOnAd } from '../components/CatalogTestOnAd'
import { CatalogGroupForm } from '../components/CatalogGroupForm'
import { CatalogVariantForm } from '../components/CatalogVariantForm'
import { CatalogResetModal } from '../components/CatalogResetModal'
import type { CatalogGroup, CatalogVariant } from '../lib/api'

const CATEGORY_ORDER = ['protection', 'bagagerie', 'confort', 'navigation', 'eclairage', 'esthetique', 'performance', 'autre']

function RefreshStatusBadge() {
  const { t } = useTranslation()
  const { data: status } = useRefreshStatus()
  if (!status) return null

  const colors = {
    running: 'bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20',
    idle: 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20',
    error: 'bg-red-500/10 text-red-300 ring-1 ring-red-500/20',
  }

  const labels = {
    running: t('catalog.refreshing'),
    idle: t('catalog.refreshIdle'),
    error: t('catalog.refreshError'),
  }

  return (
    <Badge className={colors[status.status]}>
      {status.status === 'running' && <RefreshCw className="h-3 w-3 animate-spin mr-1" />}
      {labels[status.status]}
    </Badge>
  )
}

function GroupRow({
  group,
  onEdit,
  onDelete,
  onNewVariant,
  onEditVariant,
}: {
  group: CatalogGroup
  onEdit: () => void
  onDelete: () => void
  onNewVariant: () => void
  onEditVariant: (v: CatalogVariant) => void
}) {
  const { t } = useTranslation()
  const { formatPrice } = useFormatters()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-xl hover:bg-white/[0.015] transition-colors">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-0.5 rounded-md hover:bg-white/[0.06] text-text-dim hover:text-text-secondary transition-colors"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-text-primary">{group.name}</span>
            {group.expressions.map((expr) => (
              <Badge
                key={expr}
                className="bg-white/[0.05] text-text-dim ring-1 ring-white/[0.08]"
              >
                {expr}
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-text-dim">
              {t('catalog.variant', { count: group.variants.length })}
            </span>
            <span className="text-xs text-text-dim">
              {t('catalog.matches', { count: group.last_match_count })}
            </span>
            <span className="text-xs text-text-dim">{formatPrice(group.default_price)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-text-dim hover:text-text-secondary hover:bg-white/[0.06] transition-colors"
            title={t('common.edit')}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-text-dim hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title={t('common.delete')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="pl-12 pr-4 pb-3 space-y-1">
              {group.variants.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] group transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-text-secondary">{v.name}</span>
                    {v.qualifiers.length > 0 && (
                      <span className="ml-2 text-xs text-text-dim">
                        {v.qualifiers.join(', ')}
                      </span>
                    )}
                    {v.brands.length > 0 && (
                      <span className="ml-2 text-xs text-text-dim italic">
                        {v.brands.join(', ')}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-text-dim tabular-nums">{formatPrice(v.estimated_new_price)}</span>
                  <button
                    onClick={() => onEditVariant(v)}
                    className="p-1 rounded-md text-text-dim opacity-0 group-hover:opacity-100 hover:text-text-secondary hover:bg-white/[0.06] transition-all"
                    title={t('common.edit')}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={onNewVariant}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-amber-300/70 hover:text-amber-300 transition-colors"
              >
                <Plus className="h-3 w-3" />
                {t('catalog.createVariant')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function CatalogPage() {
  const { slug } = useCurrentModel()
  const { t } = useTranslation()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: groups, isLoading } = useCatalogGroups()
  const refreshAll = useRefreshAllAccessories(slug)
  const deleteMut = useDeleteCatalogGroup()
  const resetMut = useResetCatalog()
  const exportMut = useExportCatalog()
  const importMut = useImportCatalog()

  // Form state
  const [editingGroup, setEditingGroup] = useState<CatalogGroup | undefined>()
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [variantFormState, setVariantFormState] = useState<{
    groupId: number
    group: CatalogGroup
    variant?: CatalogVariant
  } | null>(null)
  const [showResetModal, setShowResetModal] = useState(false)
  const [deletingGroupId, setDeletingGroupId] = useState<number | null>(null)

  // Group by category
  const grouped = groups?.reduce<Record<string, CatalogGroup[]>>((acc, g) => {
    ;(acc[g.category] ??= []).push(g)
    return acc
  }, {})

  function handleRefreshAll() {
    refreshAll.mutate(undefined, {
      onSuccess: (data) => {
        const msg = data.ads_skipped_manual > 0
          ? t('catalog.recalculatedWithSkipped', { skipped: data.ads_skipped_manual })
          : t('catalog.recalculated')
        toast(msg, 'success')
      },
      onError: (err) => toast((err as Error).message, 'error'),
    })
  }

  function handleDeleteGroup(group: CatalogGroup) {
    if (deletingGroupId === group.id) {
      // Second click: confirm
      deleteMut.mutate(group.id, {
        onSuccess: () => {
          toast(t('catalog.deleteGroup'), 'success')
          setDeletingGroupId(null)
        },
        onError: (err) => toast((err as Error).message, 'error'),
      })
    } else {
      setDeletingGroupId(group.id)
      // Auto-cancel after 3s
      setTimeout(() => setDeletingGroupId((prev) => (prev === group.id ? null : prev)), 3000)
    }
  }

  function handleExport() {
    exportMut.mutate(undefined, {
      onSuccess: (data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `catalog-export-${new Date().toISOString().slice(0, 10)}.json`
        a.click()
        URL.revokeObjectURL(url)
        toast(t('catalog.exportCatalog'), 'success')
      },
      onError: (err) => toast((err as Error).message, 'error'),
    })
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        importMut.mutate(data, {
          onSuccess: () => toast(t('catalog.importCatalog'), 'success'),
          onError: (err) => toast((err as Error).message, 'error'),
        })
      } catch {
        toast('Invalid JSON file', 'error')
      }
    }
    reader.readAsText(file)
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }

  function handleExportThenReset() {
    exportMut.mutate(undefined, {
      onSuccess: (data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `catalog-backup-${new Date().toISOString().slice(0, 10)}.json`
        a.click()
        URL.revokeObjectURL(url)

        resetMut.mutate(undefined, {
          onSuccess: () => {
            toast(t('catalog.resetDone'), 'success')
            setShowResetModal(false)
          },
          onError: (err) => toast((err as Error).message, 'error'),
        })
      },
      onError: (err) => toast((err as Error).message, 'error'),
    })
  }

  function handleResetDirect() {
    resetMut.mutate(undefined, {
      onSuccess: () => {
        toast(t('catalog.resetDone'), 'success')
        setShowResetModal(false)
      },
      onError: (err) => toast((err as Error).message, 'error'),
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-text-primary font-fraunces">
              {t('catalog.title')}
            </h1>
            <RefreshStatusBadge />
          </div>
          <p className="text-sm text-text-muted mt-1">
            {t('catalog.description')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={handleExport} disabled={exportMut.isPending} className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            {t('catalog.exportCatalog')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importMut.isPending}
            className="gap-1.5"
          >
            <Upload className="h-3.5 w-3.5" />
            {t('catalog.importCatalog')}
          </Button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportFile} className="hidden" />
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefreshAll}
            disabled={refreshAll.isPending}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshAll.isPending ? 'animate-spin' : ''}`} />
            {t('catalog.recalculate')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowResetModal(true)}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t('catalog.reset')}
          </Button>
          <Button size="sm" onClick={() => setShowCreateGroup(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            {t('catalog.createGroup')}
          </Button>
        </div>
      </div>

      {/* Test on ad */}
      <CatalogTestOnAd />

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-6 animate-pulse h-32" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {groups && groups.length === 0 && (
        <Card className="p-12 text-center">
          <h3 className="text-lg font-semibold text-text-primary font-fraunces">{t('catalog.emptyTitle')}</h3>
          <p className="text-sm text-text-muted mt-2">{t('catalog.emptyDescription')}</p>
        </Card>
      )}

      {/* Group list by category */}
      {grouped && (
        <div className="space-y-2">
          {CATEGORY_ORDER.filter((c) => grouped[c]?.length).map((category) => (
            <Card key={category} className="p-4">
              <div className="flex items-center gap-2 mb-2 px-2">
                <CategoryBadge category={category} />
                <span className="text-xs text-text-dim">
                  {t('catalog.accessory', { count: grouped[category].length })}
                </span>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {grouped[category].map((group) => (
                  <GroupRow
                    key={group.id}
                    group={group}
                    onEdit={() => setEditingGroup(group)}
                    onDelete={() => handleDeleteGroup(group)}
                    onNewVariant={() => setVariantFormState({ groupId: group.id, group })}
                    onEditVariant={(v) => setVariantFormState({ groupId: group.id, group, variant: v })}
                  />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation inline toast */}
      <AnimatePresence>
        {deletingGroupId && !deleteMut.isPending && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/10 backdrop-blur-xl shadow-2xl shadow-black/40"
          >
            {deleteMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin text-red-400" />
            ) : (
              <Trash2 className="h-4 w-4 text-red-400" />
            )}
            <span className="text-sm font-medium text-text-primary">
              {t('catalog.deleteGroupConfirm', {
                name: groups?.find((g) => g.id === deletingGroupId)?.name ?? '',
                count: groups?.find((g) => g.id === deletingGroupId)?.variants.length ?? 0,
              })}
            </span>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                const group = groups?.find((g) => g.id === deletingGroupId)
                if (group) handleDeleteGroup(group)
              }}
            >
              {t('common.confirm')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDeletingGroupId(null)}>
              {t('common.cancel')}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      {showCreateGroup && (
        <CatalogGroupForm onClose={() => setShowCreateGroup(false)} />
      )}

      {editingGroup && (
        <CatalogGroupForm group={editingGroup} onClose={() => setEditingGroup(undefined)} />
      )}

      {variantFormState && (
        <CatalogVariantForm
          groupId={variantFormState.groupId}
          group={variantFormState.group}
          variant={variantFormState.variant}
          onClose={() => setVariantFormState(null)}
        />
      )}

      <CatalogResetModal
        open={showResetModal}
        onOpenChange={setShowResetModal}
        groupCount={groups?.length ?? 0}
        onExportThenReset={handleExportThenReset}
        onResetDirect={handleResetDirect}
        isExporting={exportMut.isPending}
        isResetting={resetMut.isPending}
      />
    </motion.div>
  )
}
