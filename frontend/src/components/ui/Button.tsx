import { cn } from '../../lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none',
        size === 'sm' && 'px-3.5 py-1.5 text-xs rounded-lg',
        size === 'md' && 'px-5 py-2.5 text-sm rounded-xl',
        variant === 'primary' && 'bg-gradient-to-b from-amber-400 to-amber-500 text-[#0c0f14] font-semibold shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:from-amber-300 hover:to-amber-400 active:scale-[0.97]',
        variant === 'secondary' && 'bg-white/[0.06] text-[#8b95a8] border border-white/[0.08] hover:bg-white/[0.1] hover:text-[#f0f2f5] active:scale-[0.97]',
        variant === 'ghost' && 'text-[#5a6478] hover:text-[#8b95a8] hover:bg-white/[0.04]',
        variant === 'danger' && 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 active:scale-[0.97]',
        className,
      )}
      {...props}
    />
  )
}
