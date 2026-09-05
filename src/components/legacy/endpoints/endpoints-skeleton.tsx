import { LegacyListToolbarSkeleton } from '@/components/legacy/legacy-list-toolbar'

export function LegacyEndpointSummarySkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading legacy endpoint summary"
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      {Array.from({ length: 4 }).map((_, card) => (
        <div key={card} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="h-3 w-28 animate-pulse rounded-sm bg-muted" />
          <div className="mt-3 h-6 w-12 animate-pulse rounded-sm bg-muted" />
        </div>
      ))}
    </div>
  )
}

export function LegacyEndpointFiltersSkeleton() {
  return <LegacyListToolbarSkeleton label="Loading legacy endpoint filters" />
}

export function LegacyEndpointResultsSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading legacy endpoint results"
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <div className="space-y-3 p-4">
        {Array.from({ length: 8 }).map((_, row) => (
          <div key={row} className="flex gap-4">
            {Array.from({ length: 9 }).map((_, column) => (
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
