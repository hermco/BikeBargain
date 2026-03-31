import { Badge } from './ui/Badge'
import { cn } from '../lib/utils'

const CATEGORY_COLORS: Record<string, string> = {
  protection: 'bg-orange-500/10 text-ui-orange ring-1 ring-orange-500/20',
  bagagerie: 'bg-blue-500/10 text-ui-blue ring-1 ring-blue-500/20',
  confort: 'bg-emerald-500/10 text-ui-emerald ring-1 ring-emerald-500/20',
  navigation: 'bg-cyan-500/10 text-ui-cyan ring-1 ring-cyan-500/20',
  eclairage: 'bg-yellow-500/10 text-ui-yellow ring-1 ring-yellow-500/20',
  esthetique: 'bg-pink-500/10 text-ui-pink ring-1 ring-pink-500/20',
  performance: 'bg-red-500/10 text-ui-red ring-1 ring-red-500/20',
  autre: 'bg-tint/[0.05] text-text-secondary ring-1 ring-tint/10',
}

export function AccessoryBadge({ category, name }: { category: string; name: string }) {
  return (
    <Badge className={cn(CATEGORY_COLORS[category] ?? CATEGORY_COLORS.autre)}>
      {name}
    </Badge>
  )
}

export function CategoryBadge({ category }: { category: string }) {
  return (
    <Badge className={cn(CATEGORY_COLORS[category] ?? CATEGORY_COLORS.autre)}>
      {category}
    </Badge>
  )
}
