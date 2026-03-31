import { Search, ArrowUpDown } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Select } from './ui/Select'
import { useVariantOptions } from '../hooks/useCurrentModel'
import { EASE_OUT_EXPO } from './animations'

export type SortOption = 'recent' | 'price_asc' | 'price_desc' | 'km_asc' | 'km_desc'

interface FilterBarProps {
  variant: string
  onVariantChange: (v: string) => void
  search: string
  onSearchChange: (s: string) => void
  sort: SortOption
  onSortChange: (s: SortOption) => void
}

const SORT_OPTIONS = [
  { value: 'recent', labelKey: 'filter.recentlyAdded' },
  { value: 'price_asc', labelKey: 'filter.priceAsc' },
  { value: 'price_desc', labelKey: 'filter.priceDesc' },
  { value: 'km_asc', labelKey: 'filter.kmAsc' },
  { value: 'km_desc', labelKey: 'filter.kmDesc' },
]

export function FilterBar({ variant, onVariantChange, search, onSearchChange, sort, onSortChange }: FilterBarProps) {
  const { t } = useTranslation()
  const { colorNames } = useVariantOptions()

  const colorOptions = [
    { value: '', label: t('filter.allColors') },
    ...colorNames.map((c) => ({ value: c, label: c })),
  ]

  const sortOptions = SORT_OPTIONS.map((o) => ({
    value: o.value,
    label: t(o.labelKey),
  }))

  return (
    <motion.div
      className="flex flex-col sm:flex-row gap-3 mb-8"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
    >
      <div className="relative flex-1 group">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-dim transition-colors duration-200 group-focus-within:text-accent-text/70" />
        <input
          type="text"
          placeholder={t('filter.searchPlaceholder')}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-xl bg-tint/[0.04] border border-tint/[0.06] pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder-text-dim focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/30 transition-all"
        />
      </div>
      <Select
        value={variant}
        onChange={onVariantChange}
        options={colorOptions}
        className="w-full sm:w-auto sm:min-w-[160px]"
      />
      <Select
        value={sort}
        onChange={(v) => onSortChange(v as SortOption)}
        options={sortOptions}
        icon={<ArrowUpDown className="h-4 w-4" />}
        className="w-full sm:w-auto sm:min-w-[170px]"
      />
    </motion.div>
  )
}
