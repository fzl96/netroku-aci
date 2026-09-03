export function DeviceDetailSkeleton() {
  return (
    <div className="space-y-6 px-8 py-6" aria-busy="true" aria-label="Loading device">
      <div className="flex items-center gap-4 rounded-xl border border-border p-6">
        <div className="size-16 animate-pulse rounded-lg bg-muted" />
        <div className="space-y-2">
          <div className="h-5 w-40 animate-pulse rounded-sm bg-muted" />
          <div className="h-3 w-28 animate-pulse rounded-sm bg-muted" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, card) => (
          <div
            key={card}
            className="h-32 animate-pulse rounded-xl border border-border bg-muted/40"
          />
        ))}
      </div>
    </div>
  )
}

export function DevicesResultsSkeleton() {
  return (
    <div className="space-y-4 px-8 py-6" aria-busy="true" aria-label="Loading devices">
      <div className="flex items-center justify-between gap-4">
        <div className="h-8 max-w-xs flex-1 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="space-y-3 p-4">
          {Array.from({ length: 8 }).map((_, row) => (
            <div key={row} className="flex gap-4">
              {Array.from({ length: 7 }).map((_, column) => (
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
    </div>
  )
}

export function DeviceImportContentSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading device import">
      <div className="flex justify-end">
        <div className="h-8 w-44 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="h-56 animate-pulse rounded-xl border border-dashed border-border bg-muted/30" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, card) => (
          <div
            key={card}
            className="h-24 animate-pulse rounded-xl border border-border bg-muted/40"
          />
        ))}
      </div>
    </div>
  )
}
