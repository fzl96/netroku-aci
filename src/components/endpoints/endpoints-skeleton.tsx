import type { EndpointView } from '@/lib/endpoints/params'

const ENDPOINT_COLUMNS = [
  'MAC',
  'IP',
  'VLAN',
  'Node',
  'Interface',
  'EPG',
  'First seen',
  'Last seen',
  'Status',
]
const PORT_COLUMNS = ['Node', 'Interface', 'Endpoints', 'VLANs', 'EPG', 'Last seen']
const WIDTHS = [52, 68, 30, 42, 58, 75, 62, 62, 40]

function Pulse({ className = '' }: { className?: string }) {
  return <span className={`block animate-pulse rounded bg-muted ${className}`} />
}

export function EndpointOverviewSkeleton() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading endpoint filters and totals"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <div data-endpoint-overview-controls className="flex w-full items-center gap-2 md:w-auto">
        <Pulse className="h-9 w-44" />
        <Pulse className="h-9 min-w-36 flex-1 md:w-56 md:flex-none" />
        <Pulse className="size-9" />
      </div>
      <div data-endpoint-overview-stats className="flex items-center gap-3">
        <Pulse className="h-3 w-16" />
        <Pulse className="h-3 w-20" />
      </div>
    </section>
  )
}

export function EndpointHeaderActionsSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading endpoint page actions"
      className="flex w-full items-center gap-2 md:w-auto"
    >
      <Pulse className="h-9 min-w-0 flex-1 md:w-48 md:flex-none" />
      <Pulse className="h-9 w-20" />
      <Pulse className="h-9 w-20" />
    </div>
  )
}

export function EndpointResultsSkeleton({ view = 'endpoint' }: { view?: EndpointView }) {
  const columns = view === 'endpoint' ? ENDPOINT_COLUMNS : PORT_COLUMNS

  return (
    <section
      aria-busy="true"
      aria-label={`Loading ${view === 'endpoint' ? 'endpoint' : 'port'} results`}
      className="space-y-3"
    >
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
        <table className="w-full text-xs">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  data-skeleton-column
                  className="px-4 py-2.5 text-left text-[10px] text-faint uppercase"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, row) => (
              <tr key={row} className="border-b border-border-faint last:border-0">
                {columns.map((column, index) => (
                  <td key={column} className="px-4 py-2.5">
                    <Pulse className="h-2.5" />
                    <span className="sr-only">{WIDTHS[(row + index) % WIDTHS.length]}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div data-endpoint-result-cards className="space-y-2 md:hidden">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <Pulse className="h-3 w-36" />
            <Pulse className="h-2.5 w-full" />
            <Pulse className="h-2.5 w-3/4" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <Pulse className="h-3 w-36" />
        <Pulse className="h-8 w-48" />
      </div>
    </section>
  )
}
