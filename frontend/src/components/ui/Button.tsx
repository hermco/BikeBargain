import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

export function Button({ variant = 'primary', size = 'md', className, disabled, ...props }: ButtonProps) {
  return (
    <motion.button
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none',
        size === 'sm' && 'px-3.5 py-1.5 text-xs rounded-lg gap-1.5',
        size === 'md' && 'px-5 py-2.5 text-sm rounded-xl gap-2',
        variant === 'primary' && 'bg-gradient-to-b from-amber-400 to-amber-500 text-gray-900 font-semibold shadow-lg shadow-amber-500/25 hover:shadow-xl hover:shadow-amber-500/35 hover:from-amber-300 hover:to-amber-400',
        variant === 'secondary' && 'bg-tint/[0.06] text-text-secondary border border-tint/[0.08] hover:bg-tint/[0.1] hover:text-text-primary hover:border-tint/[0.12]',
        variant === 'ghost' && 'text-text-muted hover:text-text-secondary hover:bg-tint/[0.04]',
        variant === 'danger' && 'bg-red-500/10 text-ui-red border border-red-500/20 hover:bg-red-500/20',
        className,
      )}
      disabled={disabled}
      {...props}
    />
  )
}
