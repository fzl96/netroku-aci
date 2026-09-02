'use client'

import type { ReactNode } from 'react'
import { createContext, useContext, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { IconChevronLeft, IconChevronRight, IconFilter2, IconRefresh, IconSearch, IconServer } from '@tabler/icons-react'
import { ApicCredentialDialog } from '@/components/ApicCredentialDialog'
import { FilterSubmenu } from '@/components/FilterSubmenu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { buildEpgPageUrl, countActiveEpgFilterGroups, type EpgPageParams, type EpgPageSize, type EpgView } from '@/lib/epgs/params'
import type { EpgHostOption, EpgOverviewData, EpgResultsData } from '@/lib/epgs/query'
import type { EpgPortSummary } from '@/lib/epgs/sort'
import { DENSE_TABLE_HEAD_CLS, SEARCH_INPUT_CLS, TABLE_SCROLL_CLS } from '@/lib/ui-classes'
import { EpgDetailPanel } from './epg-detail-panel'
import { EpgPortDetailPanel } from './epg-port-detail-panel'
import { ExportEpgsDialog } from './export-epgs-dialog'

type Navigation = { isPending: boolean; navigate: (url: string) => void; refresh: () => void }
const NavigationContext = createContext<Navigation | null>(null)
function useNavigation() { const value = useContext(NavigationContext); if (!value) throw new Error('EPG navigation requires EpgsClient'); return value }

type Overrides = { apic?: string; view?: EpgView; query?: string; page?: number; pageSize?: EpgPageSize; tenant?: string[]; ap?: string[]; node?: string[] }
function url(params: EpgPageParams, overrides: Overrides) {
  const view = overrides.view ?? params.view
  return buildEpgPageUrl({
    hostId: overrides.apic ?? params.hostId, view, query: overrides.query ?? params.query,
    page: overrides.page ?? params.page, pageSize: overrides.pageSize ?? params.pageSize,
    tenants: overrides.tenant ?? params.tenants, appProfiles: overrides.ap ?? params.appProfiles,
    nodes: view === 'port' ? overrides.node ?? params.nodes : [],
  })
}
function fmt(value: string | null) { return value ? new Date(value).toLocaleString() : '—' }
const PAGE_SIZES: EpgPageSize[] = [10, 50, 100, 1000, 'all']

export function EpgsClient({ actions, children }: { actions: ReactNode; children: ReactNode }) {
  const router = useRouter(); const [isPending, startTransition] = useTransition()
  const navigation = { isPending, navigate: (next: string) => startTransition(() => router.replace(next)), refresh: () => startTransition(() => router.refresh()) }
  return <NavigationContext.Provider value={navigation}><div className="min-h-full bg-background"><header className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0"><div className="flex flex-col justify-between gap-3 px-4 py-3 md:h-16 md:flex-row md:items-center md:px-8 md:py-0"><div><h1 className="font-serif text-[18px] font-semibold text-foreground">EPG</h1><p className="mt-0.5 text-xs text-subtle">Deployed EPGs and their static port bindings</p></div>{actions}</div></header><main className="space-y-4 px-4 py-4 md:px-8 md:py-6">{children}</main></div></NavigationContext.Provider>
}

export function EpgHeaderActionsClient({ params, hosts, hostTotal, filteredTotal }: { params: EpgPageParams; hosts: EpgHostOption[]; hostTotal: number; filteredTotal: number }) {
  const { isPending, navigate, refresh } = useNavigation(); const [syncing, setSyncing] = useState(false); const [credentialOpen, setCredentialOpen] = useState(false)
  const selectedHost = hosts.find(host => host.id === params.hostId)
  async function resync(credentials: { username: string; password: string }) {
    setSyncing(true)
    try {
      const response = await fetch('/api/epgs/resync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apicHostId: params.hostId, ...credentials }) })
      const data = await response.json() as { syncedEpgs?: number; syncedBindings?: number; error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Resync failed')
      toast.success(`Synced ${data.syncedEpgs} EPGs (${data.syncedBindings} port bindings)`); refresh()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Resync failed') } finally { setSyncing(false) }
  }
  return <div className="flex w-full items-center gap-2 md:w-auto"><select value={params.hostId} onChange={event => navigate(event.target.value ? `/epgs?apic=${event.target.value}` : '/epgs')} disabled={isPending} className="min-w-0 flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground md:min-w-[180px] md:flex-none"><option value="">Select APIC host…</option>{hosts.map(host => <option key={host.id} value={host.id}>{host.name} ({host.host})</option>)}</select><button type="button" onClick={() => setCredentialOpen(true)} disabled={!params.hostId || syncing || isPending} className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"><IconRefresh size={12} className={syncing ? 'animate-spin' : ''} />{syncing ? 'Syncing…' : isPending ? 'Loading…' : 'Resync'}</button><ExportEpgsDialog apicHostId={params.hostId} hostTotal={hostTotal} filteredTotal={filteredTotal} filters={{ query: params.query, tenant: params.tenants, ap: params.appProfiles, node: params.nodes }} /><ApicCredentialDialog open={credentialOpen} onOpenChange={setCredentialOpen} title="Resync EPGs" description={`Enter APIC credentials for ${selectedHost?.name ?? 'the selected host'}. Credentials are used for this resync only.`} onSubmit={resync} /></div>
}

export function NoEpgHost() {
  return <section className="flex flex-col items-center justify-center py-28 text-center"><div className="mb-6 flex size-14 items-center justify-center rounded-2xl border border-border bg-card"><IconServer size={24} className="text-faint" /></div><h2 className="font-serif text-base font-semibold">No APIC hosts configured</h2><p className="mt-1 max-w-[280px] text-xs text-subtle">Add an APIC host in Settings to view EPG inventory.</p></section>
}

export function EpgOverviewClient({ params, overview }: { params: EpgPageParams; overview: EpgOverviewData }) {
  const { isPending, navigate } = useNavigation(); const [search, setSearch] = useState(params.query); const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const active = countActiveEpgFilterGroups({ tenant: params.tenants, ap: params.appProfiles, node: params.nodes })
  function go(overrides: Overrides) { navigate(url(params, overrides)) }
  function searchChange(value: string) { setSearch(value); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => go({ query: value, page: 1 }), 300) }
  function filter(key: 'tenant' | 'ap' | 'node', value: string[]) { go({ [key]: value, page: 1 }) }
  return <section className={`flex flex-wrap items-center justify-between gap-3 transition-opacity ${isPending ? 'pointer-events-none opacity-60' : ''}`}><div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto"><div className="flex overflow-hidden rounded-lg border border-border">{([['epg', 'By EPG'], ['port', 'By Port']] as const).map(([view, label]) => <button type="button" key={view} onClick={() => go({ view, page: 1 })} disabled={isPending} className={`px-3 py-2 text-xs font-semibold ${params.view === view ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{label}</button>)}</div><div className="relative min-w-[140px] flex-1 md:w-56 md:flex-none"><IconSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input value={search} onChange={event => searchChange(event.target.value)} placeholder={params.view === 'epg' ? 'Search EPG, tenant, BD…' : 'Search node, port, EPG…'} className={SEARCH_INPUT_CLS} /></div><DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label="Filter EPGs" disabled={isPending} className={`relative flex size-9 items-center justify-center rounded-lg border ${active ? 'border-primary bg-primary/8' : 'border-border bg-muted'}`}><IconFilter2 size={15} />{active > 0 && <span className="absolute -right-1.5 -top-1.5 rounded-full bg-primary px-1 text-[10px] text-primary-foreground">{active}</span>}</button></DropdownMenuTrigger><DropdownMenuContent className="w-44" align="start"><DropdownMenuLabel>Filters</DropdownMenuLabel><DropdownMenuSeparator /><FilterSubmenu label="Tenant" value={params.tenants} options={overview.choices.tenants} onChange={value => filter('tenant', value)} disabled={isPending} searchable /><FilterSubmenu label="App Profile" value={params.appProfiles} options={overview.choices.appProfiles} onChange={value => filter('ap', value)} disabled={isPending} searchable />{params.view === 'port' && <FilterSubmenu label="Node" value={params.nodes} options={overview.choices.nodes} onChange={value => filter('node', value)} disabled={isPending} searchable />}</DropdownMenuContent></DropdownMenu></div><span className="text-xs text-subtle" title="Last EPG sync">synced {fmt(overview.lastEpgSyncAt)}</span></section>
}

export function EpgResultsClient({ params, results }: { params: EpgPageParams; results: EpgResultsData }) {
  const { isPending, navigate } = useNavigation(); const [epgId, setEpgId] = useState<string | null>(null); const [port, setPort] = useState<EpgPortSummary | null>(null)
  const { page, pageSize, total, totalPages } = results.pagination; const noun = results.view === 'epg' ? 'EPGs' : 'ports'; const effective = { ...params, page }
  const size = pageSize === 'all' ? Math.max(total, 1) : pageSize; const start = total ? (page - 1) * size + 1 : 0; const end = pageSize === 'all' ? total : Math.min(page * size, total)
  const filtered = Boolean(params.query || params.tenants.length || params.appProfiles.length || params.nodes.length)
  function go(overrides: Overrides) { navigate(url(effective, overrides)) }
  const selectedEpg = results.view === 'epg' ? results.rows.find(row => row.id === epgId) ?? null : null
  return <section className={`space-y-3 transition-opacity ${isPending ? 'pointer-events-none opacity-60' : ''}`}><div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">{results.rows.length === 0 ? <div className="px-4 py-14 text-center"><p className="text-sm text-subtle">{filtered ? `No ${noun} match the current filters` : `No ${noun} found`}</p><p className="mt-1 text-xs text-faint">{filtered ? 'Try adjusting the search or filter values' : 'Click Resync to pull the latest data from the APIC'}</p></div> : <div className={TABLE_SCROLL_CLS}>{results.view === 'epg' ? <table className="w-full text-xs"><thead><tr>{['EPG', 'Tenant', 'App Profile', 'Bridge Domain', 'Ports', 'Contracts'].map(label => <th key={label} className={DENSE_TABLE_HEAD_CLS}>{label}</th>)}</tr></thead><tbody>{results.rows.map(row => <tr key={row.id} onClick={() => setEpgId(row.id)} className="cursor-pointer border-b border-border-faint hover:bg-muted"><td className="border-l-2 border-l-transparent px-4 py-2.5 font-mono font-medium">{row.name}</td><td className="px-4 py-2.5 text-muted-foreground">{row.tenant}</td><td className="px-4 py-2.5 font-mono text-subtle">{row.appProfile}</td><td className="px-4 py-2.5 font-mono text-muted-foreground">{row.bridgeDomain || '—'}</td><td className="px-4 py-2.5 tabular-nums">{row.bindings.length}</td><td className="px-4 py-2.5 tabular-nums">{row.providedContracts.length + row.consumedContracts.length}</td></tr>)}</tbody></table> : <table className="w-full text-xs"><thead><tr>{['Node', 'Port', 'Type', 'EPGs', 'Tenants', 'Encaps / VLANs', 'Mode'].map(label => <th key={label} className={DENSE_TABLE_HEAD_CLS}>{label}</th>)}</tr></thead><tbody>{results.rows.map(row => <tr key={row.id} onClick={() => setPort(row)} className="cursor-pointer border-b border-border-faint hover:bg-muted"><td className="px-4 py-2.5 font-medium">{row.node}</td><td className="px-4 py-2.5 font-mono text-muted-foreground">{row.port}</td><td className="px-4 py-2.5 text-subtle">{row.pathType}</td><td className="px-4 py-2.5 font-semibold">{row.epgCount}</td><td className="px-4 py-2.5 text-muted-foreground">{row.tenants.join(', ') || '—'}</td><td className="px-4 py-2.5 font-mono text-muted-foreground">{row.encaps.join(', ') || '—'}</td><td className="px-4 py-2.5 text-subtle">{row.modes.join(', ') || '—'}</td></tr>)}</tbody></table>}</div>}</div>{total > 0 && <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><p className="text-xs text-subtle">{pageSize === 'all' ? `Showing all ${total} ${noun}` : `Showing ${start}–${end} of ${total} ${noun}`}</p><div className="flex items-center gap-2"><span className="text-xs text-faint">Per page</span><select value={String(pageSize)} onChange={event => go({ pageSize: event.target.value === 'all' ? 'all' : Number(event.target.value) as EpgPageSize, page: 1 })} disabled={isPending} className="rounded-lg border border-border bg-muted px-2 py-1.5 text-xs">{PAGE_SIZES.map(value => <option key={String(value)} value={String(value)}>{value === 'all' ? 'All' : value}</option>)}</select>{pageSize !== 'all' && totalPages > 1 && <><button type="button" onClick={() => go({ page: page - 1 })} disabled={page <= 1 || isPending} className="rounded-lg border border-border px-2.5 py-1.5 text-xs disabled:opacity-40"><IconChevronLeft size={12} />Prev</button><span className="text-xs text-subtle">{page} / {totalPages}</span><button type="button" onClick={() => go({ page: page + 1 })} disabled={page >= totalPages || isPending} className="rounded-lg border border-border px-2.5 py-1.5 text-xs disabled:opacity-40">Next<IconChevronRight size={12} /></button></>}</div></div>}<EpgDetailPanel epg={selectedEpg} onClose={() => setEpgId(null)} /><EpgPortDetailPanel port={port} onClose={() => setPort(null)} /></section>
}
