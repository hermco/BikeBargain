import { cn } from '../../lib/utils'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
  hover?: boolean
}

export function Card({ children, className, hover = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-tint/[0.06] bg-surface/80 backdrop-blur-sm shadow-xl shadow-black/20 transition-all duration-300',
        hover && 'hover:border-tint/[0.1] hover:shadow-2xl hover:shadow-black/30 hover:-translate-y-0.5',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
