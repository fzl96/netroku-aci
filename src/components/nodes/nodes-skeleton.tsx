import type { NodeView } from '@/lib/nodes/params'

function Pulse({ className = '' }: { className?: string }) {
  return <span className={`block animate-pulse rounded bg-muted ${className}`} />
}

export function NodeHeaderActionsSkeleton() {
  return <div aria-busy="true" aria-label="Loading node page actions" className="flex w-full items-center gap-2 md:w-auto"><Pulse className="h-9 min-w-0 flex-1 md:w-48" /><Pulse className="h-9 w-20" /></div>
}
export function NodeOverviewSkeleton() {
  return <section aria-busy="true" aria-label="Loading node overview" className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex justify-between"><div className="space-y-2"><Pulse className="h-2.5 w-20" /><Pulse className="h-10 w-28" /></div><div className="space-y-2"><Pulse className="ml-auto h-2.5 w-28" /><Pulse className="ml-auto h-7 w-12" /></div></div></section>
}
export function NodeTrendSkeleton() {
  return <section aria-busy="true" aria-label="Loading node trend" className="h-[232px] rounded-2xl border border-border bg-card p-4 shadow-sm"><Pulse className="h-2.5 w-20" /><Pulse className="mt-5 h-40 w-full" /></section>
}
export function NodeResultsSkeleton({ view = 'nodes' }: { view?: NodeView }) {
  const columns = view === 'components' ? ['Node', 'Type', 'Name', 'Status', 'Model'] : ['Node', 'Name', 'Role', 'Model', 'Version', 'State', 'Uptime', 'PSU', 'Fan']
  return <section aria-busy="true" aria-label={`Loading ${view === 'components' ? 'component' : 'node'} results`} className="space-y-3"><div className="flex justify-between"><Pulse className="h-9 w-96" /><Pulse className="h-3 w-24" /></div><div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block"><table className="w-full text-xs"><thead><tr>{columns.map(column => <th key={column} className="px-4 py-2.5 text-left text-[10px] uppercase text-faint">{column}</th>)}</tr></thead><tbody>{Array.from({ length: 8 }).map((_, row) => <tr key={row} className="border-b border-border-faint">{columns.map(column => <td key={column} className="px-4 py-2.5"><Pulse className="h-2.5" /></td>)}</tr>)}</tbody></table></div><div className="space-y-2 md:hidden">{Array.from({ length: 4 }).map((_, row) => <Pulse key={row} className="h-32 w-full" />)}</div></section>
}
