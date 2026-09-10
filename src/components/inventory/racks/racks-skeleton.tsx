export function RacksResultsSkeleton() {
  return (
    <div
      className="space-y-4 px-4 py-4 md:px-8 md:py-6"
      aria-busy="true"
      aria-label="Loading racks"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-muted" />
        <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="h-3 w-48 animate-pulse rounded-sm bg-muted" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, card) => (
          <div
            key={card}
            className="h-64 animate-pulse rounded-xl border border-border bg-muted/40"
          />
        ))}
      </div>
    </div>
  )
}
