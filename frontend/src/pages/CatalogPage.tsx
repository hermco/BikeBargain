import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, RotateCcw, Pencil, X, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card } from '../components/ui/Card'
import { CategoryBadge } from '../components/AccessoryBadge'
import { useAccessoryCatalog, useUpdateCatalogPrice, useResetCatalogPrice, useRefreshAllAccessories } from '../hooks/queries'
import { useToast } from '../components/Toast'
import { useFormatters } from '../hooks/useFormatters'
import { Button } from '../components/ui/Button'
import type { CatalogAccessory } from '../lib/api'

const CATEGORY_ORDER = ['protection', 'bagagerie', 'confort', 'navigation', 'eclairage', 'esthetique', 'performance', 'autre']

function EditablePrice({ item }: { item: CatalogAccessory }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(item.estimated_new_price))
  const { toast } = useToast()
  const { t } = useTranslation()
  const { formatPrice } = useFormatters()
  const updatePrice = useUpdateCatalogPrice()
  const resetPrice = useResetCatalogPrice()

  const handleSave = () => {
    const parsed = parseInt(value, 10)
    if (isNaN(parsed) || parsed < 0) {
      toast(t('catalog.invalidPrice'), 'error')
      return
    }
    updatePrice.mutate(
      { group: item.group, estimated_new_price: parsed },
      {
        onSuccess: (data) => {
          toast(t('catalog.priceUpdated', { count: data.ads_refreshed }), 'success')
          setEditing(false)
        },
        onError: (err) => toast((err as Error).message, 'error'),
      },
    )
  }

  const handleReset = () => {
    resetPrice.mutate(item.group, {
      onSuccess: (data) => {
        toast(t('catalog.priceReset', { count: data.ads_refreshed }), 'success')
      },
      onError: (err) => toast((err as Error).message, 'error'),
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') {
      setValue(String(item.estimated_new_price))
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          className="w-20 px-2 py-1 text-sm text-right rounded-lg bg-white/[0.06] border border-white/10 text-text-primary focus:outline-none focus:ring-1 focus:ring-amber-500/50"
        />
        <span className="text-text-dim text-xs">&euro;</span>
        <button
          onClick={handleSave}
          disabled={updatePrice.isPending}
          className="p-1 rounded-md hover:bg-emerald-500/10 text-emerald-400 transition-colors"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => { setValue(String(item.estimated_new_price)); setEditing(false) }}
          className="p-1 rounded-md hover:bg-white/5 text-text-muted transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => { setValue(String(item.estimated_new_price)); setEditing(true) }}
        className="group flex items-center gap-1.5 text-sm text-text-primary hover:text-amber-300 transition-colors"
      >
        <span className={item.has_override ? 'text-amber-300 font-medium' : ''}>
          {formatPrice(item.estimated_new_price)}
        </span>
        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
      {item.has_override && (
        <button
          onClick={handleReset}
          disabled={resetPrice.isPending}
          title={t('catalog.resetToDefault', { price: formatPrice(item.default_new_price) })}
          className="p-1 rounded-md hover:bg-white/5 text-text-dim hover:text-text-muted transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

function CategorySection({ category, items }: { category: string; items: CatalogAccessory[] }) {
  const { t } = useTranslation()
  const { formatPrice } = useFormatters()

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <CategoryBadge category={category} />
        <span className="text-xs text-text-dim">{t('catalog.accessory', { count: items.length })}</span>
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <div
            key={item.group}
            className="flex items-center justify-between px-4 py-2.5 rounded-xl hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex-1 min-w-0">
              <span className="text-sm text-text-secondary">{item.name}</span>
              {item.has_override && (
                <span className="ml-2 text-[10px] text-text-dim line-through">
                  {formatPrice(item.default_new_price)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-6 shrink-0">
              <EditablePrice item={item} />
              <span className="text-xs text-text-dim w-20 text-right">
                {t('common.used')}: {formatPrice(item.estimated_used_price)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CatalogPage() {
  const { data: catalog, isLoading } = useAccessoryCatalog()
  const refreshAll = useRefreshAllAccessories()
  const { toast } = useToast()
  const { t } = useTranslation()

  const grouped = catalog?.reduce<Record<string, CatalogAccessory[]>>((acc, item) => {
    ;(acc[item.category] ??= []).push(item)
    return acc
  }, {})

  function handleRefreshAll() {
    refreshAll.mutate(undefined, {
      onSuccess: (data) => {
        const msg = data.ads_skipped_manual > 0
          ? t('catalog.recalculatedWithSkipped', { refreshed: data.ads_refreshed, skipped: data.ads_skipped_manual })
          : t('catalog.recalculated', { refreshed: data.ads_refreshed })
        toast(msg, 'success')
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
            {t('catalog.title')}
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {t('catalog.description')}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRefreshAll}
          disabled={refreshAll.isPending}
          className="gap-1.5 shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshAll.isPending ? 'animate-spin' : ''}`} />
          {t('catalog.recalculate')}
        </Button>
      </div>

      {isLoading && (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-6 animate-pulse h-32" />
          ))}
        </div>
      )}

      {grouped && (
        <div className="space-y-2">
          {CATEGORY_ORDER.filter((c) => grouped[c]?.length).map((category) => (
            <Card key={category} className="p-5">
              <CategorySection category={category} items={grouped[category]} />
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  )
}
