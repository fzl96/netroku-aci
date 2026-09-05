import { LegacyListToolbarSkeleton } from '@/components/legacy/legacy-list-toolbar'

export function LegacyHealthSummarySkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading legacy health summary"
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      {Array.from({ length: 4 }).map((_, card) => (
        <div key={card} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="h-3 w-28 animate-pulse rounded-sm bg-muted" />
          <div className="mt-3 h-5 w-20 animate-pulse rounded-sm bg-muted" />
        </div>
      ))}
    </div>
  )
}

export function LegacyHealthFiltersSkeleton() {
  return <LegacyListToolbarSkeleton label="Loading legacy health filters" />
}

export function LegacyHealthResultsSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading legacy health results"
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <div className="space-y-3 p-4">
        {Array.from({ length: 8 }).map((_, row) => (
          <div key={row} className="flex gap-4">
            {Array.from({ length: 10 }).map((_, column) => (
              <div
                key={column}
                className="h-3 flex-1 animate-pulse rounded-sm bg-muted"
                style={{ maxWidth: `${35 + ((row * 13 + column * 17) % 45)}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
