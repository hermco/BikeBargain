export function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface/80 overflow-hidden">
      <div className="h-56 bg-white/[0.03] animate-pulse" />
      <div className="p-5 space-y-3">
        <div className="h-4 bg-white/[0.06] rounded-lg w-3/4 animate-pulse" />
        <div className="h-3 bg-white/[0.04] rounded-lg w-1/2 animate-pulse" />
        <div className="flex gap-2">
          <div className="h-6 bg-white/[0.06] rounded-lg w-16 animate-pulse" />
          <div className="h-6 bg-white/[0.04] rounded-lg w-20 animate-pulse" />
        </div>
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 bg-white/[0.03] rounded-xl animate-pulse" style={{ animationDelay: `${i * 50}ms` }} />
      ))}
    </div>
  )
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface/80 p-6">
      <div className="h-3 bg-white/[0.06] rounded-lg w-20 mb-3 animate-pulse" />
      <div className="h-8 bg-white/[0.04] rounded-lg w-28 animate-pulse" />
    </div>
  )
}
