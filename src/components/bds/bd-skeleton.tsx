function Pulse({ className = '' }: { className?: string }) {
  return <span className={`block animate-pulse rounded bg-muted ${className}`} />
}

export function BdHeaderActionsSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading Bridge Domain page actions"
      className="flex w-full items-center gap-2 md:w-auto"
    >
      <Pulse className="h-9 min-w-0 flex-1 md:w-48" />
      <Pulse className="h-9 w-20" />
      <Pulse className="h-9 w-20" />
    </div>
  )
}
export function BdFilterSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading Bridge Domain filters"
      className="flex items-center gap-3"
    >
      <Pulse className="size-9" />
      <Pulse className="h-3 w-36" />
    </div>
  )
}

export function BdResultsSkeleton() {
  const columns = ['Bridge Domain', 'Tenant', 'VRF', 'Routing', 'Subnets', 'EPGs']
  return (
    <section aria-busy="true" aria-label="Loading Bridge Domain results" className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr>
              {columns.map((column) => (
                <th className="px-4 py-2.5 text-left text-[10px] text-faint uppercase" key={column}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, row) => (
              <tr className="border-b border-border-faint" key={row}>
                {columns.map((column) => (
                  <td className="px-4 py-2.5" key={column}>
                    <Pulse className="h-2.5" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between">
        <Pulse className="h-3 w-36" />
        <Pulse className="h-8 w-48" />
      </div>
    </section>
  )
}
