import { Search, ArrowUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Select } from './ui/Select'

export type SortOption = 'recent' | 'price_asc' | 'price_desc' | 'km_asc' | 'km_desc'

interface FilterBarProps {
  variant: string
  onVariantChange: (v: string) => void
  search: string
  onSearchChange: (s: string) => void
  sort: SortOption
  onSortChange: (s: SortOption) => void
}

const VARIANT_OPTIONS = [
  { value: '', labelKey: 'filter.allVariants' },
  { value: 'Base', label: 'Base' },
  { value: 'Pass', label: 'Pass' },
  { value: 'Summit', label: 'Summit' },
  { value: 'Mana Black', label: 'Mana Black' },
]

const SORT_OPTIONS = [
  { value: 'recent', labelKey: 'filter.recentlyAdded' },
  { value: 'price_asc', labelKey: 'filter.priceAsc' },
  { value: 'price_desc', labelKey: 'filter.priceDesc' },
  { value: 'km_asc', labelKey: 'filter.kmAsc' },
  { value: 'km_desc', labelKey: 'filter.kmDesc' },
]

export function FilterBar({ variant, onVariantChange, search, onSearchChange, sort, onSortChange }: FilterBarProps) {
  const { t } = useTranslation()

  const variantOptions = VARIANT_OPTIONS.map((o) => ({
    value: o.value,
    label: o.labelKey ? t(o.labelKey) : o.label!,
  }))

  const sortOptions = SORT_OPTIONS.map((o) => ({
    value: o.value,
    label: t(o.labelKey),
  }))

  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-8">
      <div className="relative flex-1">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-dim" />
        <input
          type="text"
          placeholder={t('filter.searchPlaceholder')}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-xl bg-white/[0.04] border border-white/[0.06] pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder-text-dim focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/30 transition-all"
        />
      </div>
      <Select
        value={variant}
        onChange={onVariantChange}
        options={variantOptions}
        className="w-full sm:w-auto sm:min-w-[160px]"
      />
      <Select
        value={sort}
        onChange={(v) => onSortChange(v as SortOption)}
        options={sortOptions}
        icon={<ArrowUpDown className="h-4 w-4" />}
        className="w-full sm:w-auto sm:min-w-[170px]"
      />
    </div>
  )
}
