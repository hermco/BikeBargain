import { Bike } from 'lucide-react'

interface EmptyStateProps {
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-5">
        <Bike className="h-8 w-8 text-text-dim" />
      </div>
      <h3 className="text-lg font-semibold text-text-secondary mb-1.5 font-fraunces">{title}</h3>
      {description && <p className="text-sm text-text-muted mb-5 max-w-sm">{description}</p>}
      {action}
    </div>
  )
}
