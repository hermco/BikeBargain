import { Search, ArrowUpDown } from 'lucide-react'
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
  { value: '', label: 'Toutes variantes' },
  { value: 'Base', label: 'Base' },
  { value: 'Pass', label: 'Pass' },
  { value: 'Summit', label: 'Summit' },
  { value: 'Mana Black', label: 'Mana Black' },
]

const SORT_OPTIONS = [
  { value: 'recent', label: 'Plus récent' },
  { value: 'price_asc', label: 'Prix croissant' },
  { value: 'price_desc', label: 'Prix décroissant' },
  { value: 'km_asc', label: 'Km croissant' },
  { value: 'km_desc', label: 'Km décroissant' },
]

export function FilterBar({ variant, onVariantChange, search, onSearchChange, sort, onSortChange }: FilterBarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-8">
      <div className="relative flex-1">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-dim" />
        <input
          type="text"
          placeholder="Rechercher par ville, titre..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-xl bg-white/[0.04] border border-white/[0.06] pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder-text-dim focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/30 transition-all"
        />
      </div>
      <Select
        value={variant}
        onChange={onVariantChange}
        options={VARIANT_OPTIONS}
        className="w-full sm:w-auto sm:min-w-[160px]"
      />
      <Select
        value={sort}
        onChange={(v) => onSortChange(v as SortOption)}
        options={SORT_OPTIONS}
        icon={<ArrowUpDown className="h-4 w-4" />}
        className="w-full sm:w-auto sm:min-w-[170px]"
      />
    </div>
  )
}
