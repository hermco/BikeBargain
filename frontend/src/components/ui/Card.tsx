import { cn } from '../../lib/utils'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
}

export function Card({ children, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/[0.06] bg-surface/80 backdrop-blur-sm shadow-xl shadow-black/20',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
