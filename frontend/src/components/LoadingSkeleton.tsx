export function CardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div
      className="rounded-2xl border border-tint/[0.06] bg-surface/80 overflow-hidden animate-[fadeIn_0.3s_ease-out_both]"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="h-48 skeleton-shimmer" />
      <div className="p-4 space-y-3">
        <div className="h-4 skeleton-shimmer rounded-lg w-3/4" />
        <div className="h-3 skeleton-shimmer rounded-lg w-1/2" />
        <div className="flex gap-2">
          <div className="h-6 skeleton-shimmer rounded-lg w-16" />
          <div className="h-6 skeleton-shimmer rounded-lg w-20" />
        </div>
        <div className="flex items-center justify-between pt-1">
          <div className="h-3 skeleton-shimmer rounded-lg w-24" />
          <div className="h-3 skeleton-shimmer rounded-lg w-16" />
        </div>
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-12 skeleton-shimmer rounded-xl"
          style={{ animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  )
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-tint/[0.06] bg-surface/80 p-6">
      <div className="h-3 skeleton-shimmer rounded-lg w-20 mb-3" />
      <div className="h-8 skeleton-shimmer rounded-lg w-28" />
    </div>
  )
}
