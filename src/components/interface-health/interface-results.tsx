'use client'

import type { FormEvent, MouseEvent } from 'react'
import { use, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
} from '@tabler/icons-react'
import {
  DataCard,
  DataCardBody,
  DataCardHeader,
  DataCardRow,
  DataCardTitle,
} from '@/components/ui/data-card'
import { selectVisibleCounters, type CounterMode } from '@/lib/interface-health/counter-mode'
import { buildInterfaceDetailUrl } from '@/lib/interface-health/detail-params'
import {
  buildInterfaceHealthPageUrl,
  INTERFACE_PAGE_SIZES,
  type InterfaceHealthPageParams,
  type InterfacePageSize,
  type InterfaceTableSort,
} from '@/lib/interface-health/params'
import type {
  InterfaceLoadState,
  InterfaceResultsData,
  InterfaceResultsPayload,
} from '@/lib/interface-health/query'
import type { InterfaceSortDirection, TableSortKey } from '@/lib/interface-health/sort'
import { DENSE_TABLE_HEAD_CLS, TABLE_SCROLL_CLS } from '@/lib/ui-classes'
import { fmtDate, fmtRelative } from '@/lib/interface-health/format'
import { InterfaceRegionError } from './interface-region-error'
import { OperStBadge } from './interface-status-badge'

const PAGE_SIZE_OPTIONS: { label: string; value: InterfacePageSize }[] = [
  ...INTERFACE_PAGE_SIZES.map((value) => ({
    label: String(value),
    value: value as InterfacePageSize,
  })),
  { label: 'All', value: 'all' as const },
]

function interfaceUrl(
  params: InterfaceHealthPageParams,
  overrides: Partial<InterfaceHealthPageParams>,
): string {
  return buildInterfaceHealthPageUrl({ ...params, ...overrides })
}

function fmtCount(value: string | null): string {
  if (value === null) return '—'
  // Plain decimal — no abbreviation. Caller decides on highlighting.
  return value
}

function fmtDelta(value: string | null): string {
  if (value === null) return 'Reset'
  return value
}

function isNonZero(value: string | null): boolean {
  if (value === null) return false
  try {
    return BigInt(value) > BigInt(0)
  } catch {
    return false
  }
}

function nextSort(
  results: InterfaceResultsData,
  key: TableSortKey,
  counterMode: CounterMode,
): InterfaceTableSort {
  const direction: InterfaceSortDirection =
    results.sortKey === key && results.sortDirection === 'desc' ? 'asc' : 'desc'
  return key === 'crcWindowTotal'
    ? { kind: 'crc-window', direction }
    : { kind: 'counter', sort: { key, direction, mode: counterMode } }
}

function EmptyResults({
  params,
  className,
}: {
  params: InterfaceHealthPageParams
  className: string
}) {
  const filtered = Boolean(params.query) || params.nodes.length > 0
  if (params.view === 'crc' && !filtered) {
    return (
      <div className={className}>
        <p className="text-sm text-subtle">
          No interfaces with increasing CRC errors in the last{' '}
          {params.window === '30d' ? '30 days' : '7 days'}
        </p>
        <p className="mt-1 text-xs text-faint">
          All monitored interfaces are reporting zero CRC error increases
        </p>
      </div>
    )
  }
  if (filtered) {
    return (
      <div className={className}>
        <p className="text-sm text-subtle">No interfaces match the current filters</p>
        <p className="mt-1 text-xs text-faint">Try adjusting the search or filter values</p>
      </div>
    )
  }
  return (
    <div className={className}>
      <p className="text-sm text-subtle">No interfaces synced yet</p>
      <p className="mt-1 text-xs text-faint">
        Click <strong>Resync</strong> to pull the latest data from APIC
      </p>
    </div>
  )
}

function TableSkeleton({ columns = 8 }: { columns?: number }) {
  return (
    <tbody>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="border-b border-border-faint last:border-0">
          {Array.from({ length: columns }).map((_, j) => (
            <td
              key={j}
              className={['px-4 py-2.5', j === 0 ? 'border-l-2 border-l-transparent' : ''].join(
                ' ',
              )}
            >
              <div
                className="h-2.5 animate-pulse rounded-sm bg-muted"
                style={{ width: `${35 + ((i * 13 + j * 17) % 45)}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

function InterfaceResultsContent({
  params,
  results,
}: {
  params: InterfaceHealthPageParams
  results: InterfaceResultsData
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [jumpValue, setJumpValue] = useState('')

  const { rows, total, page, pageSize, sortKey, sortDirection } = results
  const effectivePageSize = pageSize === 'all' ? Math.max(total, 1) : pageSize
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize))
  const rangeStart = total === 0 ? 0 : (page - 1) * effectivePageSize + 1
  const rangeEnd = pageSize === 'all' ? total : Math.min(page * effectivePageSize, total)

  function go(overrides: Partial<InterfaceHealthPageParams>) {
    startTransition(() => router.replace(interfaceUrl({ ...params, page }, overrides)))
  }

  function handleJump(e: FormEvent) {
    e.preventDefault()
    const target = Number.parseInt(jumpValue, 10)
    if (target >= 1 && target <= totalPages) go({ page: target })
    setJumpValue('')
  }

  // Every row links to its port, and the detail page carries this list back so
  // returning does not drop the reader's filters.
  const detailUrl = (id: string) =>
    buildInterfaceDetailUrl(id, { backUrl: interfaceUrl({ ...params, page }, {}) })

  function openInterface(event: MouseEvent, id: string) {
    // The name cell is a real link so it can be tabbed to and opened in a new
    // tab; when that is what was clicked, let it navigate on its own terms.
    if ((event.target as HTMLElement).closest('a')) return
    // Deliberately outside `startTransition`: that pending flag swaps the rows
    // for an in-place skeleton, which is right for a filter or sort but wrong
    // when leaving. Pending here would strip the table on the way out and then
    // hand over to the detail route's own fallback — two skeletons for one
    // click. Leave the rows standing until the new page takes the screen.
    router.push(detailUrl(id))
  }

  const tableHeaders: { label: string; sortKey?: TableSortKey }[] = [
    { label: 'Node' },
    { label: 'Interface' },
    { label: 'Description' },
    { label: 'Admin' },
    { label: 'Oper' },
    { label: 'Speed' },
    { label: params.counterMode === 'delta' ? 'Rx err Δ' : 'Rx err', sortKey: 'rxErrors' },
    { label: params.counterMode === 'delta' ? 'Tx err Δ' : 'Tx err', sortKey: 'txErrors' },
    params.view === 'crc'
      ? { label: `CRC (${params.window})`, sortKey: 'crcWindowTotal' as TableSortKey }
      : {
          label: params.counterMode === 'delta' ? 'CRC Δ' : 'CRC',
          sortKey: 'rxCrcErrors' as TableSortKey,
        },
    { label: params.counterMode === 'delta' ? 'Align Δ' : 'Align', sortKey: 'rxAlignErrors' },
    { label: 'Last link change' },
    { label: 'Sampled' },
  ]

  return (
    <>
      <div
        className={[
          'hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block',
          'transition-opacity duration-150',
          isPending ? 'pointer-events-none opacity-60' : 'opacity-100',
        ].join(' ')}
      >
        {rows.length === 0 && !isPending ? (
          <EmptyResults params={params} className="px-4 py-14 text-center" />
        ) : (
          <div className={TABLE_SCROLL_CLS}>
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {tableHeaders.map((h) => (
                    <th
                      key={h.label}
                      aria-sort={
                        h.sortKey && sortKey === h.sortKey
                          ? sortDirection === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : undefined
                      }
                      className={DENSE_TABLE_HEAD_CLS}
                    >
                      {h.sortKey ? (
                        <button
                          type="button"
                          onClick={() =>
                            go({ sort: nextSort(results, h.sortKey!, params.counterMode), page: 1 })
                          }
                          className="inline-flex items-center gap-1 text-inherit transition-colors hover:text-foreground"
                        >
                          <span>{h.label}</span>
                          {sortKey === h.sortKey ? (
                            sortDirection === 'asc' ? (
                              <IconChevronUp size={11} stroke={2} />
                            ) : (
                              <IconChevronDown size={11} stroke={2} />
                            )
                          ) : (
                            <span className="w-[11px]" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        h.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              {isPending ? (
                <TableSkeleton columns={tableHeaders.length} />
              ) : (
                <tbody>
                  {rows.map((r, i) => {
                    const visibleCounters = selectVisibleCounters(r, params.counterMode)

                    return (
                      <tr
                        key={r.id}
                        className="group animate-fade-up cursor-pointer border-b border-border-faint transition-colors duration-100 last:border-0 hover:bg-muted"
                        style={{ animationDelay: `${Math.min(i * 12, 200)}ms` }}
                        onClick={(e) => openInterface(e, r.id)}
                      >
                        <td className="border-l-2 border-l-transparent px-4 py-2.5 text-muted-foreground tabular-nums transition-colors duration-100 group-hover:border-l-primary">
                          {r.node || '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-foreground">
                          <Link
                            href={detailUrl(r.id)}
                            prefetch={false}
                            className="rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                          >
                            {r.ifName}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {r.description || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{r.adminSt || '—'}</td>
                        <td className="px-4 py-2.5">
                          <OperStBadge st={r.operSt} adminSt={r.adminSt} />
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                          {r.operSpeed || '—'}
                        </td>
                        <td
                          className={[
                            'px-4 py-2.5 tabular-nums',
                            isNonZero(visibleCounters.rxErrors)
                              ? 'text-danger font-semibold'
                              : 'text-faint',
                          ].join(' ')}
                        >
                          {params.counterMode === 'delta'
                            ? fmtDelta(visibleCounters.rxErrors)
                            : fmtCount(visibleCounters.rxErrors)}
                        </td>
                        <td
                          className={[
                            'px-4 py-2.5 tabular-nums',
                            isNonZero(visibleCounters.txErrors)
                              ? 'text-danger font-semibold'
                              : 'text-faint',
                          ].join(' ')}
                        >
                          {params.counterMode === 'delta'
                            ? fmtDelta(visibleCounters.txErrors)
                            : fmtCount(visibleCounters.txErrors)}
                        </td>
                        {params.view === 'crc' ? (
                          <td className="px-4 py-2.5 tabular-nums">
                            <div
                              className={
                                isNonZero(r.crcWindowTotal)
                                  ? 'text-danger font-semibold'
                                  : 'text-faint'
                              }
                            >
                              {fmtCount(r.crcWindowTotal)}
                            </div>
                            <div className="mt-0.5 text-[10px] font-normal text-faint">
                              {r.dRxCrcErrors === null
                                ? 'reset'
                                : isNonZero(r.dRxCrcErrors)
                                  ? `+${r.dRxCrcErrors} last poll`
                                  : '0 last poll'}
                            </div>
                          </td>
                        ) : (
                          <td
                            className={[
                              'px-4 py-2.5 tabular-nums',
                              isNonZero(visibleCounters.rxCrcErrors)
                                ? 'text-danger font-semibold'
                                : 'text-faint',
                            ].join(' ')}
                          >
                            {params.counterMode === 'delta'
                              ? fmtDelta(visibleCounters.rxCrcErrors)
                              : fmtCount(visibleCounters.rxCrcErrors)}
                          </td>
                        )}
                        <td
                          className={[
                            'px-4 py-2.5 tabular-nums',
                            isNonZero(visibleCounters.rxAlignErrors)
                              ? 'text-danger font-semibold'
                              : 'text-faint',
                          ].join(' ')}
                        >
                          {params.counterMode === 'delta'
                            ? fmtDelta(visibleCounters.rxAlignErrors)
                            : fmtCount(visibleCounters.rxAlignErrors)}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                          {r.hasRecentStateChange ? (
                            <span className="inline-flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-500" />
                              {fmtDate(r.lastLinkStChg)}
                            </span>
                          ) : (
                            <span className="text-faint">{fmtDate(r.lastLinkStChg)}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-faint tabular-nums">
                          {fmtRelative(r.lastSampledAt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Mobile card list */}
      <div
        className={[
          'space-y-2 transition-opacity duration-150 md:hidden',
          isPending ? 'pointer-events-none opacity-60' : 'opacity-100',
        ].join(' ')}
      >
        {rows.length === 0 && !isPending ? (
          <EmptyResults
            params={params}
            className="rounded-2xl border border-border bg-card px-4 py-14 text-center"
          />
        ) : (
          rows.map((r) => {
            const visibleCounters = selectVisibleCounters(r, params.counterMode)
            const crcValue = params.view === 'crc' ? r.crcWindowTotal : visibleCounters.rxCrcErrors
            const fmtCounter = (v: string | null) =>
              params.counterMode === 'delta' && params.view !== 'crc' ? fmtDelta(v) : fmtCount(v)
            return (
              <Link key={r.id} href={detailUrl(r.id)} prefetch={false} className="block">
                <DataCard>
                  <DataCardHeader trailing={<OperStBadge st={r.operSt} adminSt={r.adminSt} />}>
                    <DataCardTitle className="font-mono">{r.ifName}</DataCardTitle>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      Node {r.node || '—'}
                      {r.description ? ` · ${r.description}` : ''}
                    </p>
                  </DataCardHeader>
                  <DataCardBody>
                    <DataCardRow label="Speed" value={r.operSpeed || '—'} />
                    <DataCardRow
                      label="RX / TX err"
                      value={
                        <span
                          className={
                            isNonZero(visibleCounters.rxErrors) ||
                            isNonZero(visibleCounters.txErrors)
                              ? 'text-danger font-semibold'
                              : ''
                          }
                        >
                          {fmtCounter(visibleCounters.rxErrors)} /{' '}
                          {fmtCounter(visibleCounters.txErrors)}
                        </span>
                      }
                    />
                    <DataCardRow
                      label={params.view === 'crc' ? 'CRC (window)' : 'CRC err'}
                      value={
                        <span className={isNonZero(crcValue) ? 'text-danger font-semibold' : ''}>
                          {fmtCounter(crcValue)}
                        </span>
                      }
                    />
                    <DataCardRow label="Sampled" value={fmtRelative(r.lastSampledAt)} />
                  </DataCardBody>
                </DataCard>
              </Link>
            )
          })
        )}
      </div>

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="shrink-0 text-xs text-subtle">
            {pageSize === 'all'
              ? `Showing all ${total} interfaces`
              : `Showing ${rangeStart}–${rangeEnd} of ${total} interfaces`}
          </p>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 md:flex">
              <span className="text-xs text-faint">Per page</span>
              <select
                value={String(pageSize)}
                onChange={(e) =>
                  go({
                    pageSize:
                      e.target.value === 'all'
                        ? 'all'
                        : (Number(e.target.value) as InterfacePageSize),
                    page: 1,
                  })
                }
                disabled={isPending}
                className="rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-40"
              >
                {PAGE_SIZE_OPTIONS.map((o) => (
                  <option key={String(o.value)} value={String(o.value)}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {pageSize !== 'all' && totalPages > 1 && (
              <>
                <div className="hidden h-4 w-px bg-border md:block" />
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => go({ page: page - 1 })}
                    disabled={page <= 1 || isPending}
                    className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <IconChevronLeft size={12} stroke={1.75} />
                    Prev
                  </button>

                  <span className="px-2 py-1.5 text-xs text-subtle tabular-nums">
                    {page} / {totalPages}
                  </span>

                  <button
                    onClick={() => go({ page: page + 1 })}
                    disabled={page >= totalPages || isPending}
                    className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                    <IconChevronRight size={12} stroke={1.75} />
                  </button>

                  <div className="hidden h-4 w-px bg-border md:block" />

                  <form onSubmit={handleJump} className="hidden items-center gap-1 md:flex">
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={jumpValue}
                      onChange={(e) => setJumpValue(e.target.value)}
                      placeholder="Go to…"
                      className="w-20 [appearance:textfield] rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <button
                      type="submit"
                      disabled={!jumpValue || isPending}
                      className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
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
  )
}

export function InterfaceResults({
  dataPromise,
}: {
  dataPromise: Promise<InterfaceLoadState<InterfaceResultsPayload>>
}) {
  const state = use(dataPromise)
  if (state.kind === 'unauthorized') return <InterfaceRegionError region="results" />
  if (state.kind === 'inactive') return null

  return <InterfaceResultsContent params={state.data.params} results={state.data.results} />
}
