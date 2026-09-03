export function SettingsContentSkeleton() {
  return (
    <div className="space-y-6 px-8 py-6" aria-busy="true" aria-label="Loading account settings">
      <div className="grid max-w-3xl grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, card) => (
          <div
            key={card}
            className="h-20 animate-pulse rounded-xl border border-border bg-muted/40"
          />
        ))}
      </div>
      <div className="h-72 max-w-3xl animate-pulse rounded-2xl border border-border bg-muted/40" />
    </div>
  )
}
