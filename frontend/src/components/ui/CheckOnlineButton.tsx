import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScanSearch, ChevronDown, Zap, RefreshCw } from 'lucide-react'
import { cn } from '../../lib/utils'

interface CheckOnlineButtonProps {
  onQuickCheck: () => void
  onFullCheck: () => void
  isQuickPending: boolean
  isFullPending: boolean
  quickLabel: string
  fullLabel: string
  checkingLabel: string
  quickDescription?: string
  fullDescription?: string
}

export function CheckOnlineButton({
  onQuickCheck,
  onFullCheck,
  isQuickPending,
  isFullPending,
  quickLabel,
  fullLabel,
  checkingLabel,
  quickDescription,
  fullDescription,
}: CheckOnlineButtonProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const isPending = isQuickPending || isFullPending

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Close dropdown when a check starts
  useEffect(() => {
    if (isPending) setOpen(false)
  }, [isPending])

  return (
    <div ref={ref} className="relative shrink-0">
      <div className={cn(
        'inline-flex items-stretch rounded-lg border transition-all duration-200',
        isPending
          ? 'border-amber-500/30 bg-amber-500/[0.06]'
          : 'border-tint/[0.08] bg-tint/[0.06] hover:border-tint/[0.14]',
      )}>
        {/* Primary action: quick check */}
        <motion.button
          whileHover={isPending ? undefined : { scale: 1.01 }}
          whileTap={isPending ? undefined : { scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          disabled={isPending}
          onClick={onQuickCheck}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors duration-200 rounded-l-[7px]',
            'disabled:opacity-40 disabled:pointer-events-none',
            isPending ? 'text-amber-700 dark:text-amber-400' : 'text-text-secondary hover:text-text-primary',
          )}
        >
          {isPending ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Zap className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">
            {isPending ? checkingLabel : quickLabel}
          </span>
        </motion.button>

        {/* Divider */}
        <div className={cn(
          'w-px self-stretch my-1.5',
          isPending ? 'bg-amber-500/20' : 'bg-tint/[0.1]',
        )} />

        {/* Dropdown toggle */}
        <motion.button
          whileHover={isPending ? undefined : { scale: 1.05 }}
          whileTap={isPending ? undefined : { scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          disabled={isPending}
          onClick={() => setOpen(prev => !prev)}
          className={cn(
            'inline-flex items-center px-1.5 py-1.5 transition-colors duration-200 rounded-r-[7px]',
            'disabled:opacity-40 disabled:pointer-events-none',
            isPending ? 'text-amber-700 dark:text-amber-400' : 'text-text-muted hover:text-text-secondary',
          )}
          aria-label="More check options"
        >
          <ChevronDown className={cn('h-3 w-3 transition-transform duration-200', open && 'rotate-180')} />
        </motion.button>
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-full mt-1.5 z-50 min-w-[180px]"
          >
            <div className="rounded-lg border border-tint/[0.1] bg-surface/95 backdrop-blur-xl shadow-xl shadow-black/10 dark:shadow-black/30 overflow-hidden">
              <button
                onClick={() => { onQuickCheck(); setOpen(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-text-secondary hover:text-text-primary hover:bg-tint/[0.06] transition-colors"
              >
                <Zap className="h-3.5 w-3.5 text-amber-600/70 dark:text-amber-400/70" />
                <div className="text-left">
                  <div className="font-medium">{quickLabel}</div>
                  {quickDescription && <div className="text-[10px] text-text-dim mt-0.5">{quickDescription}</div>}
                </div>
              </button>
              <div className="h-px bg-tint/[0.06] mx-2" />
              <button
                onClick={() => { onFullCheck(); setOpen(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-text-secondary hover:text-text-primary hover:bg-tint/[0.06] transition-colors"
              >
                <ScanSearch className="h-3.5 w-3.5 text-purple-400/70" />
                <div className="text-left">
                  <div className="font-medium">{fullLabel}</div>
                  {fullDescription && <div className="text-[10px] text-text-dim mt-0.5">{fullDescription}</div>}
                </div>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
