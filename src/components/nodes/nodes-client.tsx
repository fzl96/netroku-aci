'use client'

import type { FormEvent, ReactNode } from 'react'
import { createContext, useContext, useEffect, useRef, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { IconChevronLeft, IconChevronRight, IconRefresh, IconSearch, IconServer } from '@tabler/icons-react'
import { ApicCredentialDialog } from '@/components/ApicCredentialDialog'
import { DataCard, DataCardBody, DataCardHeader, DataCardRow, DataCardTitle } from '@/components/ui/data-card'
import { isNodeOnline } from '@/lib/apic/node-status'
import { buildNodePageUrl, NODE_COMPONENT_TYPES, NODE_PAGE_SIZES, NODE_ROLES, type NodePageParams, type NodePageSize } from '@/lib/nodes/params'
import type { HardwareComponentRow, NodeHostOption, NodeOverviewData, NodeResultsData, NodeRow, NodeTrendPoint } from '@/lib/nodes/query'
import { DENSE_TABLE_HEAD_CLS, SEARCH_INPUT_CLS, TABLE_SCROLL_CLS } from '@/lib/ui-classes'

const NodesTrendChart = dynamic(() => import('./nodes-trend-chart'), { ssr: false, loading: () => <div className="h-[232px] animate-pulse rounded-2xl border border-border bg-card p-4 shadow-sm" /> })
const ROLE_LABEL = { leaf: 'Leaf', spine: 'Spine', controller: 'Controller' } as const
const TYPE_LABEL = { psu: 'PSU', fan: 'Fan' } as const

type Navigation = { isPending: boolean; navigate: (url: string) => void; refresh: () => void }
const NavigationContext = createContext<Navigation | null>(null)
function useNodeNavigation() {
  const value = useContext(NavigationContext)
  if (!value) throw new Error('Node navigation requires NodesClient')
  return value
}

export function NodesClient({ actions, children }: { actions: ReactNode; children: ReactNode }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const navigation = { isPending, navigate: (url: string) => startTransition(() => router.replace(url)), refresh: () => startTransition(() => router.refresh()) }
  return <NavigationContext.Provider value={navigation}><div className="min-h-full bg-background"><header className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0"><div className="flex flex-col justify-between gap-3 px-4 py-3 md:h-16 md:flex-row md:items-center md:px-8 md:py-0"><div><h1 className="font-serif text-[18px] font-semibold text-foreground">Nodes</h1><p className="mt-0.5 text-xs text-subtle">Fabric node inventory and PSU/fan health</p></div>{actions}</div></header><main className="space-y-4 px-4 py-4 md:px-8 md:py-6">{children}</main></div></NavigationContext.Provider>
}

function fmtRelative(value: string | null): string {
  if (!value) return 'never'
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return hours < 48 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}

export function NodeHeaderActionsClient({ params, hosts, lastNodeSyncAt }: { params: NodePageParams; hosts: NodeHostOption[]; lastNodeSyncAt: string | null }) {
  const { isPending, navigate, refresh } = useNodeNavigation()
  const [syncing, setSyncing] = useState(false)
  const [credentialOpen, setCredentialOpen] = useState(false)
  const selectedHost = hosts.find(host => host.id === params.hostId)
  async function handleResync(credentials: { username: string; password: string }) {
    setSyncing(true)
    try {
      const response = await fetch('/api/nodes/resync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apicHostId: params.hostId, ...credentials }) })
      const data = await response.json() as { syncedNodes?: number; syncedComponents?: number; error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Resync failed')
      toast.success(`Synced ${data.syncedNodes} nodes, ${data.syncedComponents} components`)
      refresh()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Resync failed') }
    finally { setSyncing(false) }
  }
  return <div className="flex w-full items-center gap-2 md:w-auto"><span className="hidden text-xs text-subtle lg:inline">Last synced {fmtRelative(lastNodeSyncAt)}</span><select value={params.hostId} onChange={event => navigate(event.target.value ? `/nodes?apic=${event.target.value}` : '/nodes')} disabled={isPending} className="min-w-0 flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-60 md:min-w-[180px] md:flex-none"><option value="">Select APIC host…</option>{hosts.map(host => <option key={host.id} value={host.id}>{host.name} ({host.host})</option>)}</select><button type="button" onClick={() => setCredentialOpen(true)} disabled={!params.hostId || syncing} title="Resync nodes from APIC" className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold shadow-sm ${params.hostId && !syncing ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'cursor-not-allowed bg-muted text-faint'}`}><IconRefresh size={12} className={syncing || isPending ? 'animate-spin' : ''} />{syncing ? 'Syncing…' : isPending ? 'Loading…' : 'Resync'}</button><ApicCredentialDialog open={credentialOpen} onOpenChange={setCredentialOpen} title="Resync nodes" description={`Enter APIC credentials for ${selectedHost?.name ?? 'the selected host'}. Credentials are used for this resync only.`} onSubmit={handleResync} /></div>
}

export function NoNodeHost() {
  return <div className="flex flex-col items-center justify-center py-28 text-center"><div className="relative mb-6"><div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-card shadow-sm"><IconServer size={24} stroke={1.25} className="text-faint" /></div><span className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-background bg-border" /></div><h2 className="mb-1 font-serif text-base font-semibold text-foreground">No APIC host selected</h2><p className="max-w-[260px] text-xs leading-relaxed text-subtle">No APIC hosts are configured yet. Add one in Settings to get started.</p></div>
}

export function NodeOverviewClient({ overview }: { overview: NodeOverviewData }) {
  const onlineClass = overview.nodesTotal === 0 ? 'text-muted-foreground' : overview.nodesOnline === overview.nodesTotal ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-500'
  return <section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-faint">Nodes online</p><span className={`font-serif text-4xl font-semibold tabular-nums ${onlineClass}`}>{overview.nodesTotal === 0 ? '–' : `${overview.nodesOnline}/${overview.nodesTotal}`}</span></div><div className="text-right"><p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-faint">Failed components</p><span className={`text-2xl font-semibold tabular-nums ${overview.componentsFailed > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>{overview.componentsFailed}</span></div></div></section>
}

export function NodeTrendClient({ trend }: { trend: NodeTrendPoint[] }) {
  return trend.length ? <NodesTrendChart trend={trend} /> : null
}

function StateBadge({ row }: { row: NodeRow }) {
  const online = isNodeOnline(row)
  const controller = row.role.toLowerCase() === 'controller'
  const primary = controller ? row.state || row.fabricSt || '–' : [row.fabricSt || '–', row.state].filter(Boolean).join(' / ')
  return <span className="inline-flex flex-col items-start gap-0.5"><span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${online ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/12 text-red-600 dark:text-red-400'}`}>{primary}</span>{controller && row.fabricSt && <span className="whitespace-nowrap text-[10px] leading-none text-faint">fabric: {row.fabricSt}</span>}</span>
}
function ComponentStatusBadge({ row }: { row: HardwareComponentRow }) { return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${row.healthy ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/12 text-red-600 dark:text-red-400'}`}>{row.operSt || '–'}</span> }
function ComponentCount({ value }: { value: { ok: number; total: number } }) { return value.total === 0 ? <span className="text-faint">–</span> : <span className={`font-mono tabular-nums ${value.ok < value.total ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>{value.ok}/{value.total}</span> }

function nodeUrl(params: NodePageParams, overrides: Partial<NodePageParams>): string {
  const view = overrides.view ?? params.view
  return buildNodePageUrl({ ...params, ...overrides, view, role: view === 'nodes' ? overrides.role === undefined ? params.role : overrides.role : null, componentType: view === 'components' ? overrides.componentType === undefined ? params.componentType : overrides.componentType : null })
}

export function NodeResultsClient({ params, results }: { params: NodePageParams; results: NodeResultsData }) {
  const { isPending, navigate } = useNodeNavigation()
  const [searchValue, setSearchValue] = useState(params.query)
  const [jumpValue, setJumpValue] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { page, pageSize, total, totalPages } = results.pagination
  const noun = results.view === 'components' ? 'components' : 'nodes'
  const filtered = Boolean(params.query || params.role || params.componentType)
  const effectiveSize = pageSize === 'all' ? Math.max(total, 1) : pageSize
  const rangeStart = total === 0 ? 0 : (page - 1) * effectiveSize + 1
  const rangeEnd = pageSize === 'all' ? total : Math.min(page * effectiveSize, total)
  const effective = { ...params, page }
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])
  function go(overrides: Partial<NodePageParams>) { navigate(nodeUrl(effective, overrides)) }
  function search(value: string) { setSearchValue(value); if (debounceRef.current) clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => go({ query: value.trim(), page: 1 }), 300) }
  function jump(event: FormEvent) { event.preventDefault(); const value = Number.parseInt(jumpValue, 10); if (value >= 1 && value <= totalPages) go({ page: value }); setJumpValue('') }
  const empty = <div className="px-4 py-14 text-center"><p className="text-sm text-subtle">{filtered ? `No ${noun} match the current filters` : 'No node data'}</p><p className="mt-1 text-xs text-faint">{filtered ? 'Try adjusting the search or filter values' : 'Click Resync to pull the latest data from APIC'}</p></div>
  return <section className={`space-y-3 transition-opacity ${isPending ? 'pointer-events-none opacity-60' : ''}`}><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex w-full min-w-0 items-center gap-2 md:w-auto"><div className="relative flex-1 md:w-56 md:flex-none"><IconSearch size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input value={searchValue} onChange={event => search(event.target.value)} placeholder={results.view === 'components' ? 'Search component, node, dn…' : 'Search node or name…'} className={SEARCH_INPUT_CLS} /></div><div className="inline-flex rounded-lg border border-border bg-muted p-0.5">{(['nodes', 'components'] as const).map(view => <button key={view} type="button" onClick={() => go({ view, role: null, componentType: null, page: 1 })} disabled={isPending} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${results.view === view ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{view === 'nodes' ? 'Nodes' : 'Components'}</button>)}</div>{results.view === 'nodes' ? <select value={params.role ?? 'all'} onChange={event => go({ role: event.target.value === 'all' ? null : event.target.value as NodePageParams['role'], page: 1 })} className="rounded-lg border border-border bg-muted px-2.5 py-2 text-xs text-foreground"><option value="all">All roles</option>{NODE_ROLES.map(role => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}</select> : <select value={params.componentType ?? 'all'} onChange={event => go({ componentType: event.target.value === 'all' ? null : event.target.value as NodePageParams['componentType'], page: 1 })} className="rounded-lg border border-border bg-muted px-2.5 py-2 text-xs text-foreground"><option value="all">All types</option>{NODE_COMPONENT_TYPES.map(type => <option key={type} value={type}>{TYPE_LABEL[type]}</option>)}</select>}</div><span className="text-xs text-subtle"><strong className="text-foreground">{total}</strong> {noun}</span></div><div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">{results.rows.length === 0 ? empty : <div className={TABLE_SCROLL_CLS}><table className="w-full text-xs"><thead><tr>{(results.view === 'components' ? ['Node', 'Type', 'Name', 'Status', 'Model'] : ['Node', 'Name', 'Role', 'Model', 'Version', 'State', 'Uptime', 'PSU', 'Fan']).map(label => <th key={label} className={DENSE_TABLE_HEAD_CLS}>{label}</th>)}</tr></thead><tbody>{results.view === 'components' ? results.rows.map((row, index) => <tr key={row.id} className="group animate-fade-up border-b border-border-faint last:border-0 hover:bg-muted" style={{ animationDelay: `${Math.min(index * 12, 200)}ms` }}><td className="border-l-2 border-l-transparent px-4 py-2.5 font-mono text-foreground group-hover:border-l-primary">{row.nodeId}</td><td className="px-4 py-2.5 uppercase text-muted-foreground">{row.type}</td><td className="px-4 py-2.5 font-mono text-foreground">{row.name || '–'}</td><td className="px-4 py-2.5"><ComponentStatusBadge row={row} /></td><td className="px-4 py-2.5 text-muted-foreground">{row.model || '–'}</td></tr>) : results.rows.map((row, index) => <tr key={row.id} className="group animate-fade-up border-b border-border-faint last:border-0 hover:bg-muted" style={{ animationDelay: `${Math.min(index * 12, 200)}ms` }}><td className="border-l-2 border-l-transparent px-4 py-2.5 font-mono text-foreground group-hover:border-l-primary">{row.nodeId}</td><td className="max-w-[180px] truncate px-4 py-2.5 font-mono text-foreground">{row.name || '–'}</td><td className="px-4 py-2.5 capitalize text-muted-foreground">{row.role || '–'}</td><td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{row.model || '–'}</td><td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{row.version || '–'}</td><td className="px-4 py-2.5"><StateBadge row={row} /></td><td className="whitespace-nowrap px-4 py-2.5 text-faint">{row.uptime || '–'}</td><td className="px-4 py-2.5"><ComponentCount value={row.psu} /></td><td className="px-4 py-2.5"><ComponentCount value={row.fan} /></td></tr>)}</tbody></table></div>}</div><div className="space-y-2 md:hidden">{results.rows.length === 0 ? <div className="rounded-2xl border border-border bg-card">{empty}</div> : results.view === 'components' ? results.rows.map(row => <DataCard key={row.id}><DataCardHeader trailing={<ComponentStatusBadge row={row} />}><DataCardTitle className="font-mono">{row.name || `Node ${row.nodeId}`}</DataCardTitle><p className="mt-0.5 text-xs uppercase text-muted-foreground">{row.type}</p></DataCardHeader><DataCardBody><DataCardRow label="Node" value={<span className="font-mono">{row.nodeId}</span>} /><DataCardRow label="Model" value={row.model || '—'} /></DataCardBody></DataCard>) : results.rows.map(row => <DataCard key={row.id}><DataCardHeader trailing={<StateBadge row={row} />}><DataCardTitle className="font-mono">{row.name || `Node ${row.nodeId}`}</DataCardTitle><p className="mt-0.5 text-xs capitalize text-muted-foreground">{row.role || '—'} · Node {row.nodeId}</p></DataCardHeader><DataCardBody><DataCardRow label="Model" value={row.model || '—'} /><DataCardRow label="Version" value={row.version || '—'} /><DataCardRow label="Uptime" value={row.uptime || '—'} /><DataCardRow label="PSU / Fan" value={<span className="inline-flex gap-3"><ComponentCount value={row.psu} /><ComponentCount value={row.fan} /></span>} /></DataCardBody></DataCard>)}</div>{total > 0 && <div className="flex flex-wrap items-center justify-between gap-3 pt-1"><p className="text-xs text-subtle">{pageSize === 'all' ? `Showing all ${total} ${noun}` : `Showing ${rangeStart}–${rangeEnd} of ${total} ${noun}`}</p><div className="flex items-center gap-2"><div className="hidden items-center gap-1.5 md:flex"><span className="text-xs text-faint">Per page</span><select value={String(pageSize)} onChange={event => go({ pageSize: event.target.value === 'all' ? 'all' : Number(event.target.value) as NodePageSize, page: 1 })} className="rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-foreground">{[...NODE_PAGE_SIZES, 'all' as const].map(value => <option key={String(value)} value={String(value)}>{value === 'all' ? 'All' : value}</option>)}</select></div>{pageSize !== 'all' && totalPages > 1 && <div className="flex items-center gap-1"><button type="button" onClick={() => go({ page: page - 1 })} disabled={page <= 1 || isPending} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs disabled:opacity-40"><IconChevronLeft size={12} />Prev</button><span className="px-2 text-xs text-subtle">{page} / {totalPages}</span><button type="button" onClick={() => go({ page: page + 1 })} disabled={page >= totalPages || isPending} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs disabled:opacity-40">Next<IconChevronRight size={12} /></button><form onSubmit={jump} className="hidden items-center gap-1 md:flex"><input type="number" min={1} max={totalPages} value={jumpValue} onChange={event => setJumpValue(event.target.value)} placeholder="Go to…" className="w-20 rounded-lg border border-border bg-muted px-2 py-1.5 text-xs" /><button type="submit" disabled={!jumpValue || isPending} className="rounded-lg border border-border px-2.5 py-1.5 text-xs disabled:opacity-40">Go</button></form></div>}</div></div>}</section>
}
