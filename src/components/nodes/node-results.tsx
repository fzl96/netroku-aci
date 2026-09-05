'use client'

import type { FormEvent } from 'react'
import { use, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { IconChevronLeft, IconChevronRight, IconSearch } from '@tabler/icons-react'
import {
  DataCard,
  DataCardBody,
  DataCardHeader,
  DataCardRow,
  DataCardTitle,
} from '@/components/ui/data-card'
import { isNodeOnline } from '@/lib/apic/node-status'
import {
  buildNodePageUrl,
  NODE_COMPONENT_TYPES,
  NODE_PAGE_SIZES,
  NODE_ROLES,
  type NodePageParams,
  type NodePageSize,
} from '@/lib/nodes/params'
import type {
  HardwareComponentRow,
  NodeLoadState,
  NodeResultsData,
  NodeResultsPayload,
  NodeRow,
} from '@/lib/nodes/query'
import { DENSE_TABLE_HEAD_CLS, SEARCH_INPUT_CLS, TABLE_SCROLL_CLS } from '@/lib/ui-classes'
import { NodeRegionError } from './node-region-error'

const ROLE_LABEL = { leaf: 'Leaf', spine: 'Spine', controller: 'Controller' } as const
const TYPE_LABEL = { psu: 'PSU', fan: 'Fan' } as const

function StateBadge({ row }: { row: NodeRow }) {
  const online = isNodeOnline(row)
  const controller = row.role.toLowerCase() === 'controller'
  const primary = controller
    ? row.state || row.fabricSt || '–'
    : [row.fabricSt || '–', row.state].filter(Boolean).join(' / ')
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span
        className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${online ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/12 text-red-600 dark:text-red-400'}`}
      >
        {primary}
      </span>
      {controller && row.fabricSt && (
        <span className="text-[10px] leading-none whitespace-nowrap text-faint">
          fabric: {row.fabricSt}
        </span>
      )}
    </span>
  )
}
function ComponentStatusBadge({ row }: { row: HardwareComponentRow }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${row.healthy ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/12 text-red-600 dark:text-red-400'}`}
    >
      {row.operSt || '–'}
    </span>
  )
}
function ComponentCount({ value }: { value: { ok: number; total: number } }) {
  return value.total === 0 ? (
    <span className="text-faint">–</span>
  ) : (
    <span
      className={`font-mono tabular-nums ${value.ok < value.total ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}
    >
      {value.ok}/{value.total}
    </span>
  )
}

function nodeUrl(params: NodePageParams, overrides: Partial<NodePageParams>): string {
  const view = overrides.view ?? params.view
  return buildNodePageUrl({
    ...params,
    ...overrides,
    view,
    role: view === 'nodes' ? (overrides.role === undefined ? params.role : overrides.role) : null,
    componentType:
      view === 'components'
        ? overrides.componentType === undefined
          ? params.componentType
          : overrides.componentType
        : null,
  })
}

function NodeResultsContent({
  params,
  results,
}: {
  params: NodePageParams
  results: NodeResultsData
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
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
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    },
    [],
  )
  function navigate(url: string) {
    startTransition(() => router.replace(url))
  }
  function go(overrides: Partial<NodePageParams>) {
    navigate(nodeUrl(effective, overrides))
  }
  function search(value: string) {
    setSearchValue(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => go({ query: value.trim(), page: 1 }), 300)
  }
  function jump(event: FormEvent) {
    event.preventDefault()
    const value = Number.parseInt(jumpValue, 10)
    if (value >= 1 && value <= totalPages) go({ page: value })
    setJumpValue('')
  }
  const empty = (
    <div className="px-4 py-14 text-center">
      <p className="text-sm text-subtle">
        {filtered ? `No ${noun} match the current filters` : 'No node data'}
      </p>
      <p className="mt-1 text-xs text-faint">
        {filtered
          ? 'Try adjusting the search or filter values'
          : 'Click Resync to pull the latest data from APIC'}
      </p>
    </div>
  )
  return (
    <section
      className={`space-y-3 transition-opacity ${isPending ? 'pointer-events-none opacity-60' : ''}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-full min-w-0 items-center gap-2 md:w-auto">
          <div className="relative flex-1 md:w-56 md:flex-none">
            <IconSearch
              size={13}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
            />
            <input
              value={searchValue}
              onChange={(event) => search(event.target.value)}
              placeholder={
                results.view === 'components'
                  ? 'Search component, node, dn…'
                  : 'Search node or name…'
              }
              className={SEARCH_INPUT_CLS}
            />
          </div>
          <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">
            {(['nodes', 'components'] as const).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => go({ view, role: null, componentType: null, page: 1 })}
                disabled={isPending}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${results.view === view ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {view === 'nodes' ? 'Nodes' : 'Components'}
              </button>
            ))}
          </div>
          {results.view === 'nodes' ? (
            <select
              value={params.role ?? 'all'}
              onChange={(event) =>
                go({
                  role:
                    event.target.value === 'all'
                      ? null
                      : (event.target.value as NodePageParams['role']),
                  page: 1,
                })
              }
              className="rounded-lg border border-border bg-muted px-2.5 py-2 text-xs text-foreground"
            >
              <option value="all">All roles</option>
              {NODE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={params.componentType ?? 'all'}
              onChange={(event) =>
                go({
                  componentType:
                    event.target.value === 'all'
                      ? null
                      : (event.target.value as NodePageParams['componentType']),
                  page: 1,
                })
              }
              className="rounded-lg border border-border bg-muted px-2.5 py-2 text-xs text-foreground"
            >
              <option value="all">All types</option>
              {NODE_COMPONENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABEL[type]}
                </option>
              ))}
            </select>
          )}
        </div>
        <span className="text-xs text-subtle">
          <strong className="text-foreground">{total}</strong> {noun}
        </span>
      </div>
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
        {results.rows.length === 0 ? (
          empty
        ) : (
          <div className={TABLE_SCROLL_CLS}>
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {(results.view === 'components'
                    ? ['Node', 'Type', 'Name', 'Status', 'Model', 'Serial']
                    : ['Node', 'Name', 'Serial', 'Model', 'Version', 'State', 'Uptime', 'PSU', 'Fan']
                  ).map((label) => (
                    <th key={label} className={DENSE_TABLE_HEAD_CLS}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.view === 'components'
                  ? results.rows.map((row, index) => (
                      <tr
                        key={row.id}
                        className="group animate-fade-up border-b border-border-faint last:border-0 hover:bg-muted"
                        style={{ animationDelay: `${Math.min(index * 12, 200)}ms` }}
                      >
                        <td className="border-l-2 border-l-transparent px-4 py-2.5 font-mono text-foreground group-hover:border-l-primary">
                          {row.nodeId}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground uppercase">{row.type}</td>
                        <td className="px-4 py-2.5 font-mono text-foreground">{row.name || '–'}</td>
                        <td className="px-4 py-2.5">
                          <ComponentStatusBadge row={row} />
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{row.model || '–'}</td>
                        <td className="px-4 py-2.5 font-mono text-muted-foreground">
                          {row.serial || '–'}
                        </td>
                      </tr>
                    ))
                  : results.rows.map((row, index) => (
                      <tr
                        key={row.id}
                        className="group animate-fade-up border-b border-border-faint last:border-0 hover:bg-muted"
                        style={{ animationDelay: `${Math.min(index * 12, 200)}ms` }}
                      >
                        <td className="border-l-2 border-l-transparent px-4 py-2.5 font-mono text-foreground group-hover:border-l-primary">
                          {row.nodeId}
                        </td>
                        <td className="max-w-[180px] truncate px-4 py-2.5 font-mono text-foreground">
                          {row.name || '–'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-muted-foreground">
                          {row.serial || '–'}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                          {row.model || '–'}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                          {row.version || '–'}
                        </td>
                        <td className="px-4 py-2.5">
                          <StateBadge row={row} />
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-faint">
                          {row.uptime || '–'}
                        </td>
                        <td className="px-4 py-2.5">
                          <ComponentCount value={row.psu} />
                        </td>
                        <td className="px-4 py-2.5">
                          <ComponentCount value={row.fan} />
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="space-y-2 md:hidden">
        {results.rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card">{empty}</div>
        ) : results.view === 'components' ? (
          results.rows.map((row) => (
            <DataCard key={row.id}>
              <DataCardHeader trailing={<ComponentStatusBadge row={row} />}>
                <DataCardTitle className="font-mono">
                  {row.name || `Node ${row.nodeId}`}
                </DataCardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground uppercase">{row.type}</p>
              </DataCardHeader>
              <DataCardBody>
                <DataCardRow label="Node" value={<span className="font-mono">{row.nodeId}</span>} />
                <DataCardRow label="Model" value={row.model || '—'} />
                <DataCardRow
                  label="Serial"
                  value={<span className="font-mono">{row.serial || '—'}</span>}
                />
              </DataCardBody>
            </DataCard>
          ))
        ) : (
          results.rows.map((row) => (
            <DataCard key={row.id}>
              <DataCardHeader trailing={<StateBadge row={row} />}>
                <DataCardTitle className="font-mono">
                  {row.name || `Node ${row.nodeId}`}
                </DataCardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground capitalize">
                  {row.role || '—'} · Node {row.nodeId}
                </p>
              </DataCardHeader>
              <DataCardBody>
                <DataCardRow
                  label="Serial"
                  value={<span className="font-mono">{row.serial || '—'}</span>}
                />
                <DataCardRow label="Model" value={row.model || '—'} />
                <DataCardRow label="Version" value={row.version || '—'} />
                <DataCardRow label="Uptime" value={row.uptime || '—'} />
                <DataCardRow
                  label="PSU / Fan"
                  value={
                    <span className="inline-flex gap-3">
                      <ComponentCount value={row.psu} />
                      <ComponentCount value={row.fan} />
                    </span>
                  }
                />
              </DataCardBody>
            </DataCard>
          ))
        )}
      </div>
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-xs text-subtle">
            {pageSize === 'all'
              ? `Showing all ${total} ${noun}`
              : `Showing ${rangeStart}–${rangeEnd} of ${total} ${noun}`}
          </p>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 md:flex">
              <span className="text-xs text-faint">Per page</span>
              <select
                value={String(pageSize)}
                onChange={(event) =>
                  go({
                    pageSize:
                      event.target.value === 'all'
                        ? 'all'
                        : (Number(event.target.value) as NodePageSize),
                    page: 1,
                  })
                }
                className="rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-foreground"
              >
                {[...NODE_PAGE_SIZES, 'all' as const].map((value) => (
                  <option key={String(value)} value={String(value)}>
                    {value === 'all' ? 'All' : value}
                  </option>
                ))}
              </select>
            </div>
            {pageSize !== 'all' && totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => go({ page: page - 1 })}
                  disabled={page <= 1 || isPending}
                  className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs disabled:opacity-40"
                >
                  <IconChevronLeft size={12} />
                  Prev
                </button>
                <span className="px-2 text-xs text-subtle">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => go({ page: page + 1 })}
                  disabled={page >= totalPages || isPending}
                  className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs disabled:opacity-40"
                >
                  Next
                  <IconChevronRight size={12} />
                </button>
                <form onSubmit={jump} className="hidden items-center gap-1 md:flex">
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={jumpValue}
                    onChange={(event) => setJumpValue(event.target.value)}
                    placeholder="Go to…"
                    className="w-20 rounded-lg border border-border bg-muted px-2 py-1.5 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={!jumpValue || isPending}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs disabled:opacity-40"
                  >
                    Go
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export function NodeResults({
  dataPromise,
}: {
  dataPromise: Promise<NodeLoadState<NodeResultsPayload>>
}) {
  const state = use(dataPromise)
  if (state.kind === 'unauthorized') return <NodeRegionError region="results" />
  if (state.kind === 'inactive') return null

  return <NodeResultsContent params={state.data.params} results={state.data.results} />
}
