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
        'rounded-2xl border border-tint/[0.06] bg-surface/80 backdrop-blur-sm shadow-xl transition-all duration-500 ease-out',
        hover && 'hover:border-tint/[0.12] hover:shadow-2xl hover:-translate-y-1 cursor-pointer',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
})
