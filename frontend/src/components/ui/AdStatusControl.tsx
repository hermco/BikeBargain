import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScanSearch, ChevronDown, RefreshCw, Circle, Pause, Ban } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import type { ListingStatus } from '../../types'

interface AdStatusControlProps {
  currentStatus: ListingStatus
  onCheck: () => void
  onSetStatus: (status: ListingStatus) => void
  isCheckPending: boolean
  isStatusPending: boolean
}

const STATUS_CONFIG = {
  online: {
    icon: Circle,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    dot: 'bg-emerald-400',
  },
  paused: {
    icon: Pause,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    dot: 'bg-amber-400',
  },
  sold: {
    icon: Ban,
    color: 'text-ui-red',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    dot: 'bg-red-400',
  },
} as const

export function AdStatusControl({
  currentStatus,
  onCheck,
  onSetStatus,
  isCheckPending,
  isStatusPending,
}: AdStatusControlProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const isPending = isCheckPending || isStatusPending
  const config = STATUS_CONFIG[currentStatus]

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  useEffect(() => {
    if (isPending) setOpen(false)
  }, [isPending])

  const statuses: ListingStatus[] = ['online', 'paused', 'sold']
  const otherStatuses = statuses.filter(s => s !== currentStatus)

  return (
    <div ref={ref} className="relative shrink-0">
      <div className={cn(
        'inline-flex items-stretch rounded-lg border transition-all duration-200',
        isPending
          ? 'border-amber-500/30 bg-amber-500/[0.06]'
          : `${config.border} ${config.bg}`,
      )}>
        {/* Primary action: check on LBC */}
        <motion.button
          whileHover={isPending ? undefined : { scale: 1.01 }}
          whileTap={isPending ? undefined : { scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          disabled={isPending}
          onClick={onCheck}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors duration-200 rounded-l-[7px]',
            'disabled:opacity-40 disabled:pointer-events-none',
            isPending ? 'text-amber-400' : config.color,
          )}
        >
          {isCheckPending ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ScanSearch className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">
            {isCheckPending ? t('common.checking') : t('adDetail.checkThisAd')}
          </span>
        </motion.button>

        {/* Divider */}
        <div className={cn(
          'w-px self-stretch my-1.5',
          isPending ? 'bg-amber-500/20' : 'bg-tint/[0.1]',
        )} />

        {/* Status indicator + dropdown toggle */}
        <motion.button
          whileHover={isPending ? undefined : { scale: 1.05 }}
          whileTap={isPending ? undefined : { scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          disabled={isPending}
          onClick={() => setOpen(prev => !prev)}
          className={cn(
            'inline-flex items-center gap-1 px-2 py-1.5 transition-colors duration-200 rounded-r-[7px]',
            'disabled:opacity-40 disabled:pointer-events-none',
            isPending ? 'text-amber-400' : 'text-text-muted hover:text-text-secondary',
          )}
          aria-label="Change status"
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
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
            className="absolute right-0 top-full mt-1.5 z-50 min-w-[220px]"
          >
            <div className="rounded-lg border border-tint/[0.1] bg-surface/95 backdrop-blur-xl shadow-xl shadow-black/30 overflow-hidden">
              {/* Current status */}
              <div className="px-3 py-2 border-b border-tint/[0.06]">
                <div className="text-[10px] uppercase tracking-wider text-text-dim font-medium">{t('adDetail.currentStatus')}</div>
                <div className={cn('flex items-center gap-2 mt-1 text-xs font-medium', config.color)}>
                  <span className={cn('h-2 w-2 rounded-full', config.dot)} />
                  {t(`common.${currentStatus}`)}
                </div>
              </div>

              {/* Manual status change options */}
              <div className="py-1">
                <div className="px-3 pt-1.5 pb-1">
                  <div className="text-[10px] uppercase tracking-wider text-text-dim font-medium">{t('adDetail.changeStatusManually')}</div>
                </div>
                {otherStatuses.map(status => {
                  const sc = STATUS_CONFIG[status]
                  const Icon = sc.icon
                  return (
                    <button
                      key={status}
                      onClick={() => { onSetStatus(status); setOpen(false) }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-tint/[0.06] transition-colors"
                    >
                      <Icon className={cn('h-3.5 w-3.5', sc.color)} />
                      <div className="text-left">
                        <div className="font-medium">{t(`adDetail.setStatus.${status}`)}</div>
                        <div className="text-[10px] text-text-dim mt-0.5">{t(`adDetail.setStatusDesc.${status}`)}</div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Check on LBC */}
              <div className="border-t border-tint/[0.06] py-1">
                <button
                  onClick={() => { onCheck(); setOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-tint/[0.06] transition-colors"
                >
                  <ScanSearch className="h-3.5 w-3.5 text-purple-400/70" />
                  <div className="text-left">
                    <div className="font-medium">{t('adDetail.checkThisAd')}</div>
                    <div className="text-[10px] text-text-dim mt-0.5">{t('adDetail.checkThisAdDesc')}</div>
                  </div>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
