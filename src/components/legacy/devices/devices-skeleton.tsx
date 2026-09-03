export function LegacyDeviceSummarySkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading legacy device summary"
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      {Array.from({ length: 4 }).map((_, card) => (
        <div key={card} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="h-3 w-24 animate-pulse rounded-sm bg-muted" />
          <div className="mt-3 h-6 w-12 animate-pulse rounded-sm bg-muted" />
        </div>
      ))}
    </div>
  )
}

export function LegacyDeviceFiltersSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading legacy device filters"
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
    >
      <div className="h-8 flex-1 animate-pulse rounded-lg bg-muted sm:max-w-xs" />
      {Array.from({ length: 4 }).map((_, control) => (
        <div key={control} className="h-8 w-32 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  )
}

export function LegacyDeviceResultsSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading legacy device results"
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
