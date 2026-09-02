export function InterfaceControlsSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading interface filters"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-9 w-full min-w-[140px] animate-pulse rounded-lg bg-muted md:w-56" />
        <div className="size-9 animate-pulse rounded-lg bg-muted" />
        <div className="h-9 w-[220px] animate-pulse rounded-lg bg-muted" />
        <div className="h-9 w-[124px] animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="h-4 w-24 animate-pulse rounded-sm bg-muted" />
    </div>
  )
}

export function InterfaceNodeFilterSkeleton() {
  return <div aria-busy="true" aria-label="Loading node filter" className="size-9 animate-pulse rounded-lg bg-muted" />
}

export function InterfaceSummarySkeleton() {
  return <span aria-busy="true" aria-label="Loading interface count" className="inline-block h-4 w-24 animate-pulse rounded-sm bg-muted" />
}

export function InterfaceCrcTrendSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading CRC trend"
      className="h-[232px] animate-pulse rounded-2xl border border-border bg-card p-4 shadow-sm"
    />
  )
}

export function InterfaceResultsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading interface results" className="space-y-2">
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
        <div className="space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, row) => (
            <div key={row} className="flex gap-4">
              {Array.from({ length: 6 }).map((_, column) => (
                <div
                  key={column}
                  className="h-2.5 flex-1 animate-pulse rounded-sm bg-muted"
                  style={{ maxWidth: `${35 + ((row * 13 + column * 17) % 45)}%` }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2 md:hidden">
        {Array.from({ length: 4 }).map((_, card) => (
          <div key={card} className="h-28 animate-pulse rounded-2xl border border-border bg-card" />
        ))}
      </div>
    </div>
  )
}

export function InterfaceHeaderActionsSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading interface actions"
      className="flex w-full items-center gap-2 md:w-auto"
    >
      <div className="h-9 min-w-0 flex-1 animate-pulse rounded-lg bg-muted md:min-w-[180px] md:flex-none" />
      <div className="h-9 w-[92px] animate-pulse rounded-lg bg-muted" />
      <div className="h-9 w-[88px] animate-pulse rounded-lg bg-muted" />
    </div>
  )
}
