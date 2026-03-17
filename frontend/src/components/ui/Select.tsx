import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  icon?: React.ReactNode
}

export function Select({ value, onChange, options, placeholder, className, icon }: SelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [open])

  const selected = options.find((o) => o.value === value)

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 w-full rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 py-2.5 text-sm text-left transition-all cursor-pointer',
          'hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/30',
          open && 'ring-2 ring-amber-500/30 border-amber-500/30',
        )}
      >
        {icon && <span className="text-text-dim shrink-0">{icon}</span>}
        <span className={cn('flex-1 truncate', selected ? 'text-text-secondary' : 'text-text-dim')}>
          {selected?.label ?? placeholder ?? 'Sélectionner...'}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-text-dim shrink-0 transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full min-w-[160px] rounded-xl bg-surface border border-white/[0.08] shadow-2xl shadow-black/40 py-1.5 max-h-60 overflow-y-auto">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={cn(
                'w-full text-left px-4 py-2 text-sm transition-colors',
                opt.value === value
                  ? 'text-amber-300 bg-amber-500/10'
                  : 'text-text-secondary hover:bg-white/[0.04] hover:text-text-primary',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
