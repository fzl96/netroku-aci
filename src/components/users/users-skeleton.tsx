export function UsersResultsSkeleton() {
  return (
    <div className="min-h-full bg-background" aria-busy="true" aria-label="Loading users">
      <div className="border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="flex h-16 items-center justify-between px-8">
          <div>
            <div className="h-4 w-16 animate-pulse rounded-sm bg-muted" />
            <div className="mt-2 h-3 w-52 animate-pulse rounded-sm bg-muted" />
          </div>
          <div className="h-8 w-28 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
      <div className="space-y-6 px-8 py-6">
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, card) => (
            <div key={card} className="h-24 animate-pulse rounded-xl border border-border bg-muted/40" />
          ))}
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
    </div>
  )
}
