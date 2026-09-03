export function ApicHostsResultsSkeleton() {
  return (
    <div className="space-y-6 px-8 py-6" aria-busy="true" aria-label="Loading APIC hosts">
      <div className="flex justify-end">
        <div className="h-8 w-24 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="grid grid-cols-4 gap-4">
        <div className="h-24 animate-pulse rounded-xl border border-border bg-muted/40" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="space-y-3 p-4">
          {Array.from({ length: 4 }).map((_, row) => (
            <div key={row} className="flex gap-4">
              {Array.from({ length: 4 }).map((_, column) => (
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
