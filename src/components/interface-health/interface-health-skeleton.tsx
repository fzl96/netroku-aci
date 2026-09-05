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
  return (
    <div
      aria-busy="true"
      aria-label="Loading node filter"
      className="size-9 animate-pulse rounded-lg bg-muted"
    />
  )
}

export function InterfaceSummarySkeleton() {
  return (
    <span
      aria-busy="true"
      aria-label="Loading interface count"
      className="inline-block h-4 w-24 animate-pulse rounded-sm bg-muted"
    />
  )
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
              {Array.from({ length: 12 }).map((_, column) => (
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

export function InterfaceDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading interface" className="min-h-full bg-background">
      <header className="border-b border-border bg-background/90">
        <div className="flex flex-col gap-3 px-4 py-3 md:px-8 md:py-4">
          <div className="h-3 w-20 animate-pulse rounded-sm bg-muted" />
          <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
            <div className="space-y-2">
              <div className="h-5 w-56 animate-pulse rounded-sm bg-muted" />
              <div className="h-3 w-40 animate-pulse rounded-sm bg-muted" />
            </div>
            <div className="h-3 w-48 animate-pulse rounded-sm bg-muted" />
          </div>
        </div>
      </header>
      <main className="space-y-4 px-4 py-4 md:px-8 md:py-6">
        <div className="h-9 w-[220px] animate-pulse rounded-lg bg-muted" />
        <div className="h-[440px] animate-pulse rounded-2xl border border-border bg-card" />
        <div className="h-[200px] animate-pulse rounded-2xl border border-border bg-card" />
        <div className="h-[320px] animate-pulse rounded-2xl border border-border bg-card" />
      </main>
    </div>
  )
}
