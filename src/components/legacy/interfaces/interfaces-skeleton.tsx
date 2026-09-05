export function LegacyInterfaceSummarySkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading legacy interface summary"
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      {Array.from({ length: 4 }).map((_, card) => (
        <div key={card} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="h-3 w-28 animate-pulse rounded-sm bg-muted" />
          <div className="mt-3 h-6 w-16 animate-pulse rounded-sm bg-muted" />
        </div>
      ))}
    </div>
  )
}

export function LegacyInterfaceFiltersSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading legacy interface filters"
      className="flex flex-wrap items-center gap-2"
    >
      <div className="h-9 min-w-56 flex-1 animate-pulse rounded-lg bg-muted md:w-72 md:flex-none" />
      <div className="size-9 shrink-0 animate-pulse rounded-lg bg-muted" />
      <div className="h-9 w-64 animate-pulse rounded-lg bg-muted" />
      <div className="h-9 w-36 animate-pulse rounded-lg bg-muted" />
    </div>
  )
}

export function LegacyInterfaceResultsSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading legacy interface results"
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <div className="space-y-3 p-4">
        {Array.from({ length: 8 }).map((_, row) => (
          <div key={row} className="flex gap-4">
            {Array.from({ length: 8 }).map((_, column) => (
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

export function LegacyInterfaceDetailSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading interface detail"
      className="min-h-full bg-background"
    >
      <div className="border-b border-border px-4 py-3 md:px-8 md:py-4">
        <div className="h-3 w-20 animate-pulse rounded-sm bg-muted" />
        <div className="mt-3 h-5 w-72 animate-pulse rounded-sm bg-muted" />
        <div className="mt-2 h-3 w-40 animate-pulse rounded-sm bg-muted" />
      </div>
      <div className="space-y-4 px-4 py-4 md:px-8 md:py-6">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
        <div className="h-32 animate-pulse rounded-2xl bg-muted" />
        <div className="h-80 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  )
}
