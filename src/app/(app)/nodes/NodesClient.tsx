'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  IconChevronLeft,
  IconChevronRight,
  IconRefresh,
  IconSearch,
  IconServer,
  IconLoader,
} from '@tabler/icons-react'
import type { SafeApicHost } from '@/actions/apic-hosts'
import { isNodeOnline } from '@/lib/apic/node-status'
import {
  DENSE_TABLE_HEAD_CLS,
  SEARCH_INPUT_CLS,
  TABLE_SCROLL_CLS,
} from '@/lib/ui-classes'
import { ApicCredentialDialog } from '@/components/ApicCredentialDialog'
import type { TrendPoint } from './NodesTrendChart'

const NodesTrendChart = dynamic(() => import('./NodesTrendChart'), {
  ssr: false,
  loading: () => (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm h-[232px] animate-pulse" />
  ),
})

export interface NodeRowProps {
  id: string
  nodeId: string
  name: string
  role: string
  model: string
  version: string | null
  fabricSt: string
  state: string | null
  uptime: string | null
  psu: { ok: number; total: number }
  fan: { ok: number; total: number }
}

export interface ComponentRowProps {
  id: string
  nodeId: string
  type: string
  name: string
  operSt: string
  healthy: boolean
  model: string
}

type View = 'nodes' | 'components'

type PageSizeValue = 10 | 50 | 100 | 1000 | 'all'
const PAGE_SIZE_OPTIONS: { label: string; value: PageSizeValue }[] = [
  { label: '10', value: 10 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
  { label: '1000', value: 1000 },
  { label: 'All', value: 'all' },
]

const ROLES = ['leaf', 'spine', 'controller'] as const
const ROLE_LABEL: Record<(typeof ROLES)[number], string> = {
  leaf: 'Leaf',
  spine: 'Spine',
  controller: 'Controller',
}

const TYPES = ['psu', 'fan'] as const
const TYPE_LABEL: Record<(typeof TYPES)[number], string> = {
  psu: 'PSU',
  fan: 'Fan',
}

interface Props {
  apicHosts: SafeApicHost[]
  selectedApic: string | null
  query: string
  view: View
  role: string | null
  type: string | null
  nodeRows: NodeRowProps[]
  componentRows: ComponentRowProps[]
  total: number
  page: number
  pageSize: PageSizeValue
  lastSyncedAt: string | null
  nodesOnline: number
  nodesTotal: number
  componentsFailed: number
  trend: TrendPoint[]
}

function fmtRelative(date: string | null): string {
  if (!date) return 'never'
  const ms = Date.now() - new Date(date).getTime()
  if (ms < 60_000) return 'just now'
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 48) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

function StateBadge({ role, fabricSt, state }: { role: string; fabricSt: string; state: string | null }) {
  const online = isNodeOnline({ role, fabricSt, state })
  const controller = role.toLowerCase() === 'controller'
  const primary = controller
    ? state || fabricSt || '-'
    : [fabricSt || '-', state].filter(Boolean).join(' / ')

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span
        className={[
          'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
          online
            ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
            : 'bg-red-500/12 text-red-600 dark:text-red-400',
        ].join(' ')}
      >
        {primary}
      </span>
      {controller && fabricSt && (
        <span className="text-[10px] leading-none text-faint whitespace-nowrap">
          fabric: {fabricSt}
        </span>
      )}
    </span>
  )
}

function ComponentStatusBadge({ operSt, healthy }: { operSt: string; healthy: boolean }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
        healthy
          ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
          : 'bg-red-500/12 text-red-600 dark:text-red-400',
      ].join(' ')}
    >
      {operSt || '-'}
    </span>
  )
}

function ComponentCount({ value }: { value: { ok: number; total: number } }) {
  if (value.total === 0) return <span className="text-faint">-</span>
  const failed = value.ok < value.total
  return (
    <span
      className={[
        'font-mono tabular-nums',
        failed ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
      ].join(' ')}
    >
      {value.ok}/{value.total}
    </span>
  )
}

function TableSkeleton({ columns = 9 }: { columns?: number }) {
  return (
    <tbody>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="border-b border-border-faint last:border-0">
          {Array.from({ length: columns }).map((_, j) => (
            <td key={j} className={['px-4 py-2.5', j === 0 ? 'border-l-2 border-l-transparent' : ''].join(' ')}>
              <div
                className="h-2.5 rounded-sm bg-muted animate-pulse"
                style={{ width: `${35 + ((i * 13 + j * 17) % 45)}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

export function NodesClient({
  apicHosts,
  selectedApic,
  query,
  view,
  role,
  type,
  nodeRows,
  componentRows,
  total,
  page,
  pageSize,
  lastSyncedAt,
  nodesOnline,
  nodesTotal,
  componentsFailed,
  trend,
}: Props) {
  const router = useRouter()
  const selectedHostId = selectedApic ?? ''
  const [syncing, setSyncing] = useState(false)
  const [credentialOpen, setCredentialOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastDispatchedQuery = useRef(query)
  const [searchValue, setSearchValue] = useState(query)
  const [jumpValue, setJumpValue] = useState('')
  const selectedHost = apicHosts.find(host => host.id === selectedHostId)

  useEffect(() => {
    if (query !== lastDispatchedQuery.current) setSearchValue(query)
  }, [query])

  const effectivePageSize = pageSize === 'all' ? Math.max(total, 1) : pageSize
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize))
  const rangeStart = total === 0 ? 0 : (page - 1) * effectivePageSize + 1
  const rangeEnd = pageSize === 'all' ? total : Math.min(page * effectivePageSize, total)
  const loading = isPending || syncing
  const rows = view === 'components' ? componentRows : nodeRows
  const itemLabel = view === 'components' ? 'components' : 'nodes'
  const onlineClass =
    nodesTotal === 0
      ? 'text-muted-foreground'
      : nodesOnline === nodesTotal
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-amber-600 dark:text-amber-500'

  function buildUrl(overrides: {
    apic?: string
    query?: string
    view?: View
    role?: string | null
    type?: string | null
    page?: number
    pageSize?: PageSizeValue
  }) {
    const params = new URLSearchParams()
    const apic = overrides.apic ?? selectedHostId
    const q = overrides.query !== undefined ? overrides.query : query
    const nextView = overrides.view ?? view
    const r = overrides.role !== undefined ? overrides.role : role
    const t = overrides.type !== undefined ? overrides.type : type
    const p = overrides.page ?? page
    const ps = overrides.pageSize !== undefined ? overrides.pageSize : pageSize

    if (apic) params.set('apic', apic)
    if (q.trim()) params.set('query', q.trim())
    if (nextView === 'components') params.set('view', nextView)
    if (r && nextView === 'nodes') params.set('role', r)
    if (t && nextView === 'components') params.set('type', t)
    if (p > 1) params.set('page', String(p))
    if (ps !== 50) params.set('pageSize', String(ps))
    const qs = params.toString()
    return `/nodes${qs ? `?${qs}` : ''}`
  }

  function handleHostChange(hostId: string) {
    startTransition(() => {
      router.replace(hostId ? `/nodes?apic=${hostId}` : '/nodes')
    })
  }

  function handleSearchChange(value: string) {
    setSearchValue(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      lastDispatchedQuery.current = value.trim()
      startTransition(() => {
        router.replace(buildUrl({ query: value, page: 1 }))
      })
    }, 300)
  }

  function handleViewChange(nextView: View) {
    startTransition(() => {
      router.replace(buildUrl({ view: nextView, role: null, type: null, page: 1 }))
    })
  }

  function handleRoleChange(value: string) {
    const next = value === 'all' ? null : value
    startTransition(() => {
      router.replace(buildUrl({ role: next, page: 1 }))
    })
  }

  function handleTypeChange(value: string) {
    const next = value === 'all' ? null : value
    startTransition(() => {
      router.replace(buildUrl({ type: next, page: 1 }))
    })
  }

  function handlePage(next: number) {
    startTransition(() => {
      router.replace(buildUrl({ page: next }))
    })
  }

  function handlePageSizeChange(ps: PageSizeValue) {
    startTransition(() => {
      router.replace(buildUrl({ pageSize: ps, page: 1 }))
    })
  }

  function handleJump(e: React.FormEvent) {
    e.preventDefault()
    const p = parseInt(jumpValue, 10)
    if (p >= 1 && p <= totalPages) handlePage(p)
    setJumpValue('')
  }

  async function handleResync(credentials: { username: string; password: string }) {
    if (!selectedHostId) return
    setSyncing(true)
    try {
      const res = await fetch('/api/nodes/resync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apicHostId: selectedHostId, ...credentials }),
      })
      const data = (await res.json()) as {
        syncedNodes?: number
        syncedComponents?: number
        error?: string
      }
      if (!res.ok) throw new Error(data.error ?? 'Resync failed')
      toast.success(`Synced ${data.syncedNodes} nodes, ${data.syncedComponents} components`)
      startTransition(() => router.refresh())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Resync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="px-8 h-16 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Nodes</h1>
            <p className="text-xs text-subtle mt-0.5">
              Fabric node inventory and PSU/fan health
              {selectedHostId && <> - last synced {fmtRelative(lastSyncedAt)}</>}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedHostId}
              onChange={e => handleHostChange(e.target.value)}
              disabled={isPending}
              className={[
                'text-xs bg-muted border border-border rounded-lg',
                'px-3 py-2 text-foreground outline-none',
                'focus:border-primary focus:ring-2 focus:ring-primary/10',
                'min-w-[180px]',
                'disabled:opacity-60 disabled:cursor-not-allowed transition-opacity',
              ].join(' ')}
            >
              <option value="">Select APIC host...</option>
              {apicHosts.map(h => (
                <option key={h.id} value={h.id}>{h.name} ({h.host})</option>
              ))}
            </select>

            <button
              onClick={() => setCredentialOpen(true)}
              disabled={!selectedHostId || syncing}
              title="Resync nodes from APIC"
              className={[
                'flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors shadow-sm',
                selectedHostId && !syncing
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-faint cursor-not-allowed',
              ].join(' ')}
            >
              <IconRefresh size={12} stroke={1.75} className={loading ? 'animate-spin' : ''} />
              {syncing ? 'Syncing...' : isPending ? 'Loading...' : 'Resync'}
            </button>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 space-y-4">
        {!selectedHostId && !isPending ? (
          <div className="flex flex-col items-center justify-center py-28 text-center">
            <div className="relative mb-6">
              <div className="w-14 h-14 rounded-2xl bg-card border border-border flex items-center justify-center shadow-sm">
                <IconServer size={24} stroke={1.25} className="text-faint" />
              </div>
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-border border-2 border-background" />
            </div>
            <h2 className="font-serif text-base font-semibold text-foreground mb-1">
              No APIC host selected
            </h2>
            <p className="text-xs text-subtle mb-6 max-w-[260px] leading-relaxed">
              {apicHosts.length === 0
                ? 'No APIC hosts configured yet. Add one in Settings to get started.'
                : 'Choose a host to view node and hardware health.'}
            </p>
            {apicHosts.length > 0 && (
              <select
                value={selectedHostId}
                onChange={e => handleHostChange(e.target.value)}
                disabled={isPending}
                className={[
                  'text-xs bg-muted border border-border rounded-lg',
                  'px-3 py-2 text-foreground outline-none cursor-pointer',
                  'focus:border-primary focus:ring-2 focus:ring-primary/10',
                  'min-w-[220px] transition-colors',
                  'disabled:opacity-60 disabled:cursor-not-allowed transition-opacity',
                ].join(' ')}
              >
                <option value="">Select APIC host...</option>
                {apicHosts.map(h => (
                  <option key={h.id} value={h.id}>{h.name} ({h.host})</option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <>
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-faint mb-1">
                    Nodes online
                  </p>
                  <span className={['font-serif text-4xl font-semibold tabular-nums', onlineClass].join(' ')}>
                    {nodesTotal === 0 ? '-' : `${nodesOnline}/${nodesTotal}`}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-faint mb-1">
                    Failed components
                  </p>
                  <span
                    className={[
                      'text-2xl font-semibold tabular-nums',
                      componentsFailed > 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-muted-foreground',
                    ].join(' ')}
                  >
                    {componentsFailed}
                  </span>
                </div>
              </div>
            </div>

            {trend.length > 0 && <NodesTrendChart trend={trend} />}

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <div className="relative w-56 shrink-0">
                  <IconSearch
                    size={13}
                    stroke={1.75}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
                  />
                  <input
                    type="text"
                    value={searchValue}
                    onChange={e => handleSearchChange(e.target.value)}
                    placeholder={view === 'components' ? 'Search component, node, dn...' : 'Search node or name...'}
                    className={SEARCH_INPUT_CLS}
                  />
                </div>

                <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">
                  {(['nodes', 'components'] as const).map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => handleViewChange(v)}
                      disabled={isPending}
                      className={[
                        'px-3 py-1.5 text-xs font-semibold rounded-md transition-colors disabled:opacity-40',
                        view === v
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      ].join(' ')}
                    >
                      {v === 'nodes' ? 'Nodes' : 'Components'}
                    </button>
                  ))}
                </div>

                {view === 'nodes' ? (
                  <select
                    value={role ?? 'all'}
                    onChange={e => handleRoleChange(e.target.value)}
                    disabled={isPending}
                    className={[
                      'text-xs bg-muted border border-border rounded-lg',
                      'px-2.5 py-2 text-foreground outline-none cursor-pointer',
                      'focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-40',
                    ].join(' ')}
                  >
                    <option value="all">All roles</option>
                    {ROLES.map(r => (
                      <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={type ?? 'all'}
                    onChange={e => handleTypeChange(e.target.value)}
                    disabled={isPending}
                    className={[
                      'text-xs bg-muted border border-border rounded-lg',
                      'px-2.5 py-2 text-foreground outline-none cursor-pointer',
                      'focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-40',
                    ].join(' ')}
                  >
                    <option value="all">All types</option>
                    {TYPES.map(t => (
                      <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0 text-xs text-subtle">
                <span>
                  <span className="font-semibold text-foreground">{total}</span> {itemLabel}
                </span>
              </div>
            </div>

            <div
              className={[
                'bg-card border border-border rounded-2xl overflow-hidden shadow-sm',
                'transition-opacity duration-150',
                isPending ? 'opacity-60 pointer-events-none' : 'opacity-100',
              ].join(' ')}
            >
              {rows.length === 0 ? (
                <div className="px-4 py-14 text-center">
                  {query || role || type ? (
                    <>
                      <p className="text-sm text-subtle">No {itemLabel} match the current filters</p>
                      <p className="text-xs text-faint mt-1">Try adjusting the search or filter values</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-subtle">No node data</p>
                      <p className="text-xs text-faint mt-1">
                        Click <strong>Resync</strong> to pull the latest data from APIC
                      </p>
                    </>
                  )}
                </div>
              ) : view === 'components' ? (
                <div className={TABLE_SCROLL_CLS}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        {['Node', 'Type', 'Name', 'Status', 'Model'].map(h => (
                          <th
                            key={h}
                            className={DENSE_TABLE_HEAD_CLS}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    {isPending ? (
                      <TableSkeleton columns={5} />
                    ) : (
                      <tbody>
                        {componentRows.map((r, i) => (
                        <tr
                          key={r.id}
                          className="group border-b border-border-faint last:border-0 hover:bg-muted transition-colors duration-100 animate-fade-up"
                          style={{ animationDelay: `${Math.min(i * 12, 200)}ms` }}
                        >
                          <td className="px-4 py-2.5 border-l-2 border-l-transparent group-hover:border-l-primary transition-colors duration-100 font-mono text-foreground">
                            {r.nodeId}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground uppercase">{r.type}</td>
                          <td className="px-4 py-2.5 font-mono text-foreground">{r.name || '-'}</td>
                          <td className="px-4 py-2.5">
                            <ComponentStatusBadge operSt={r.operSt} healthy={r.healthy} />
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">{r.model || '-'}</td>
                        </tr>
                      ))}
                      </tbody>
                    )}
                  </table>
                </div>
              ) : (
                <div className={TABLE_SCROLL_CLS}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        {['Node', 'Name', 'Role', 'Model', 'Version', 'State', 'Uptime', 'PSU', 'Fan'].map(h => (
                          <th
                            key={h}
                            className={DENSE_TABLE_HEAD_CLS}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    {isPending ? (
                      <TableSkeleton columns={9} />
                    ) : (
                      <tbody>
                        {nodeRows.map((r, i) => (
                        <tr
                          key={r.id}
                          className="group border-b border-border-faint last:border-0 hover:bg-muted transition-colors duration-100 animate-fade-up"
                          style={{ animationDelay: `${Math.min(i * 12, 200)}ms` }}
                        >
                          <td className="px-4 py-2.5 border-l-2 border-l-transparent group-hover:border-l-primary transition-colors duration-100 font-mono text-foreground">
                            {r.nodeId}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-foreground max-w-[180px] truncate" title={r.name}>
                            {r.name || '-'}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground capitalize">{r.role || '-'}</td>
                          <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{r.model || '-'}</td>
                          <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{r.version || '-'}</td>
                          <td className="px-4 py-2.5">
                            <StateBadge role={r.role} fabricSt={r.fabricSt} state={r.state} />
                          </td>
                          <td className="px-4 py-2.5 text-faint whitespace-nowrap">{r.uptime || '-'}</td>
                          <td className="px-4 py-2.5">
                            <ComponentCount value={r.psu} />
                          </td>
                          <td className="px-4 py-2.5">
                            <ComponentCount value={r.fan} />
                          </td>
                        </tr>
                      ))}
                      </tbody>
                    )}
                  </table>
                </div>
              )}
            </div>

            {total > 0 && (
              <div className="flex items-center justify-between pt-1 gap-4">
                <p className="text-xs text-subtle shrink-0">
                  {pageSize === 'all'
                    ? `Showing all ${total} ${itemLabel}`
                    : `Showing ${rangeStart}-${rangeEnd} of ${total} ${itemLabel}`}
                </p>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-faint">Per page</span>
                    <select
                      value={String(pageSize)}
                      onChange={e => handlePageSizeChange(e.target.value === 'all' ? 'all' : Number(e.target.value) as PageSizeValue)}
                      disabled={isPending}
                      className="text-xs bg-muted border border-border rounded-lg px-2 py-1.5 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-40"
                    >
                      {PAGE_SIZE_OPTIONS.map(o => (
                        <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
                      ))}
                    </select>
                  </div>

                  {pageSize !== 'all' && totalPages > 1 && (
                    <>
                      <div className="w-px h-4 bg-border" />
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handlePage(page - 1)}
                          disabled={page <= 1 || isPending}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <IconChevronLeft size={12} stroke={1.75} />
                          Prev
                        </button>

                        <span className="px-2 py-1.5 text-xs text-subtle tabular-nums">
                          {page} / {totalPages}
                        </span>

                        <button
                          onClick={() => handlePage(page + 1)}
                          disabled={page >= totalPages || isPending}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Next
                          <IconChevronRight size={12} stroke={1.75} />
                        </button>

                        <div className="w-px h-4 bg-border" />

                        <form onSubmit={handleJump} className="flex items-center gap-1">
                          <input
                            type="number"
                            min={1}
                            max={totalPages}
                            value={jumpValue}
                            onChange={e => setJumpValue(e.target.value)}
                            placeholder="Go to..."
                            className="w-20 text-xs bg-muted border border-border rounded-lg px-2 py-1.5 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="submit"
                            disabled={!jumpValue || isPending}
                            className="px-2.5 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Go
                          </button>
                        </form>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <ApicCredentialDialog
        open={credentialOpen}
        onOpenChange={setCredentialOpen}
        title="Resync nodes"
        description={`Enter APIC credentials for ${selectedHost?.name ?? 'the selected host'}. Credentials are used for this resync only.`}
        onSubmit={handleResync}
      />
    </div>
  )
}
