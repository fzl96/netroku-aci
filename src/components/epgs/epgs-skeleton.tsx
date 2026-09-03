import type { EpgView } from '@/lib/epgs/params'

function Pulse({ className = '' }: { className?: string }) {
  return <span className={`block animate-pulse rounded bg-muted ${className}`} />
}

export function EpgHeaderActionsSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading EPG page actions"
      className="flex w-full items-center gap-2 md:w-auto"
    >
      <Pulse className="h-9 min-w-0 flex-1 md:w-48" />
      <Pulse className="h-9 w-20" />
      <Pulse className="h-9 w-20" />
    </div>
  )
}
export function EpgFilterSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading EPG filters" className="flex items-center gap-3">
      <Pulse className="size-9" />
      <Pulse className="h-3 w-36" />
    </div>
  )
}

export function EpgResultsSkeleton({ view = 'epg' }: { view?: EpgView }) {
  const columns =
    view === 'epg'
      ? ['EPG', 'Tenant', 'App Profile', 'Bridge Domain', 'Ports', 'Contracts']
      : ['Node', 'Port', 'Type', 'EPGs', 'Tenants', 'Encaps / VLANs', 'Mode']
  return (
    <section
      aria-busy="true"
      aria-label={`Loading ${view === 'epg' ? 'EPG' : 'port'} results`}
      className="space-y-3"
    >
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
