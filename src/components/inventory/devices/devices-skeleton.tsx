export function DeviceDetailSkeleton() {
  return (
    <div className="min-h-full bg-background" aria-busy="true" aria-label="Loading device">
      <div className="flex h-16 items-center border-b border-border px-4 md:px-8">
        <div className="space-y-2">
          <div className="h-4 w-48 animate-pulse rounded-sm bg-muted" />
          <div className="h-3 w-32 animate-pulse rounded-sm bg-muted" />
        </div>
      </div>
      <div className="grid items-start gap-6 px-4 py-4 md:px-8 md:py-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="h-60 animate-pulse rounded-2xl border border-border bg-muted/40" />
        <div className="space-y-6">
          <div className="h-64 animate-pulse rounded-2xl border border-border bg-muted/40" />
          <div className="h-40 animate-pulse rounded-2xl border border-border bg-muted/40" />
        </div>
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
