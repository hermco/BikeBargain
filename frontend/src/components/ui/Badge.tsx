import { cn } from '../../lib/utils'

interface BadgeProps {
  children: React.ReactNode
  className?: string
}

export function Badge({ children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-lg px-2.5 py-0.5 text-[11px] font-semibold tracking-wide',
        className,
      )}
    >
      {children}
    </span>
  )
}
