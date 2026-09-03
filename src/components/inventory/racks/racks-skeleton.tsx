export function RacksResultsSkeleton() {
  return (
    <div className="px-8 pb-6 space-y-4" aria-busy="true" aria-label="Loading racks">
      <div className="h-3 w-56 animate-pulse rounded-sm bg-muted" />
      <div className="h-9 w-72 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, card) => (
          <div key={card} className="h-64 animate-pulse rounded-xl border border-border bg-muted/40" />
        ))}
      </div>
    </div>
  )
}
