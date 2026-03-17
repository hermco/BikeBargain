import { Badge } from './ui/Badge'
import { cn } from '../lib/utils'

const CATEGORY_COLORS: Record<string, string> = {
  protection: 'bg-orange-500/10 text-orange-300 ring-1 ring-orange-500/20',
  bagagerie: 'bg-blue-500/10 text-blue-300 ring-1 ring-blue-500/20',
  confort: 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20',
  navigation: 'bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-500/20',
  eclairage: 'bg-yellow-500/10 text-yellow-300 ring-1 ring-yellow-500/20',
  esthetique: 'bg-pink-500/10 text-pink-300 ring-1 ring-pink-500/20',
  performance: 'bg-red-500/10 text-red-300 ring-1 ring-red-500/20',
  autre: 'bg-white/[0.05] text-[#8b95a8] ring-1 ring-white/10',
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
