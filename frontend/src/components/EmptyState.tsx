import { Bike, Trophy, LayoutGrid, BarChart3, Search } from 'lucide-react'
import { motion } from 'framer-motion'
import { EASE_OUT_EXPO } from './animations'

interface EmptyStateProps {
  title: string
  description?: string
  action?: React.ReactNode
  icon?: 'bike' | 'trophy' | 'grid' | 'chart' | 'search'
}

const iconMap = {
  bike: Bike,
  trophy: Trophy,
  grid: LayoutGrid,
  chart: BarChart3,
  search: Search,
}

export function EmptyState({ title, description, action, icon = 'bike' }: EmptyStateProps) {
  const Icon = iconMap[icon]

  return (
    <motion.div
      className="flex flex-col items-center justify-center py-24 text-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
    >
      <motion.div
        className="relative mb-6"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4, type: 'spring', stiffness: 300, damping: 20 }}
      >
        <div className="w-16 h-16 rounded-2xl bg-tint/[0.04] border border-tint/[0.06] flex items-center justify-center">
          <Icon className="h-7 w-7 text-text-dim" />
        </div>
        <motion.div
          className="absolute -inset-3 rounded-3xl bg-accent/5 blur-xl -z-10"
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
      <motion.h3
        className="text-lg font-semibold text-text-secondary mb-1.5 font-fraunces"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4, ease: EASE_OUT_EXPO }}
      >
        {title}
      </motion.h3>
      {description && (
        <motion.p
          className="text-sm text-text-muted mb-5 max-w-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          {description}
        </motion.p>
      )}
      {action && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.3, ease: EASE_OUT_EXPO }}
        >
          {action}
        </motion.div>
      )}
    </motion.div>
  )
}
