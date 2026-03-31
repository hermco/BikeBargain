import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
  hover?: boolean
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { children, className, hover = false, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
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
})
