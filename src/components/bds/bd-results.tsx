'use client'

import { use, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { BdLoadState, BdResultsPayload } from '@/lib/bds/query'
import { BD_PAGE_SIZES, buildBdPageUrl, hasBdFilters, type BdPageSize } from '@/lib/bds/params'
import { DENSE_TABLE_HEAD_CLS, TABLE_SCROLL_CLS } from '@/lib/ui-classes'
import { BdRegionError } from './bd-region-error'
import { BdDetailPanel, BdFlag } from './bd-detail-panel'

export function BdResults({
  dataPromise,
}: {
  dataPromise: Promise<BdLoadState<BdResultsPayload>>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [selectedDn, setSelectedDn] = useState<string | null | undefined>()
  const state = use(dataPromise)
  if (state.kind === 'error') return <BdRegionError region="results" />
  if (state.kind !== 'ready') return null
  const { params, results } = state.data
  const { page, pageSize, total, totalPages } = results.pagination
  const selected =
    results.rows.find(
      (row) => row.dn === (selectedDn === undefined ? params.selected : selectedDn),
    ) ?? null
  const go = (change: { page?: number; pageSize?: BdPageSize }) =>
    startTransition(() =>
      router.replace(buildBdPageUrl({ ...params, page, ...change }), { scroll: false }),
    )
  return (
    <section className="space-y-3">
      {params.selected && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs"
        >
          <span>
            {results.rows.length
              ? 'Showing the selected Bridge Domain.'
              : 'This Bridge Domain is no longer available.'}
          </span>
          <button
            type="button"
            disabled={pending}
            className="ml-auto rounded underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() =>
              startTransition(() =>
                router.replace(buildBdPageUrl({ ...params, selected: undefined, page: 1 }), {
                  scroll: false,
                }),
              )
            }
          >
            Show all Bridge Domains
          </button>
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {results.rows.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <p className="text-sm text-subtle">
              {hasBdFilters(params)
                ? 'No Bridge Domains match the current filters'
                : 'No Bridge Domains found'}
            </p>
            <p className="mt-1 text-xs text-faint">
              {hasBdFilters(params)
                ? 'Try adjusting the search or filter values'
                : 'Click Resync to pull the latest data from the APIC'}
            </p>
          </div>
        ) : (
          <div className={TABLE_SCROLL_CLS}>
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {['Bridge Domain', 'Tenant', 'VRF', 'Routing Enabled', 'Subnets', 'EPGs'].map(
                    (label) => (
                      <th key={label} className={DENSE_TABLE_HEAD_CLS}>
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {results.rows.map((bd, index) => (
                  <tr
                    key={bd.dn}
                    data-search-selected={params.selected === bd.dn || undefined}
                    onClick={() => setSelectedDn(bd.dn)}
                    className="animate-fade-up cursor-pointer border-b border-border-faint hover:bg-muted data-[search-selected=true]:bg-primary/10"
                    style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
                  >
                    <td className="px-4 py-2.5 font-mono font-medium">
                      <button
                        type="button"
                        onClick={() => setSelectedDn(bd.dn)}
                        className="text-left hover:underline"
                      >
                        {bd.name}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{bd.tenant}</td>
                    <td className="px-4 py-2.5 font-mono text-subtle" title={bd.vrfDn}>
                      {bd.vrf || '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <BdFlag value={bd.unicastRoute} />
                    </td>
                    <td className="max-w-[280px] px-4 py-2.5 font-mono text-muted-foreground">
                      <span className="line-clamp-2" title={bd.subnets.map((s) => s.ip).join(', ')}>
                        {bd.subnets.map((s) => s.ip).join(', ') || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{bd.epgCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-subtle">
          {total} Bridge Domain{total === 1 ? '' : 's'}
        </p>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-subtle">
            Rows
            <select
              value={pageSize}
              disabled={pending}
              onChange={(e) =>
                go({
                  page: 1,
                  pageSize:
                    e.target.value === 'all' ? 'all' : (Number(e.target.value) as BdPageSize),
                })
              }
              className="rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-foreground"
            >
              {[...BD_PAGE_SIZES, 'all'].map((size) => (
                <option key={size} value={size}>
                  {size === 'all' ? 'All' : size}
                </option>
              ))}
            </select>
          </label>
          {pageSize !== 'all' && (
            <>
              <button
                type="button"
                onClick={() => go({ page: page - 1 })}
                disabled={page <= 1 || pending}
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-subtle">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => go({ page: page + 1 })}
                disabled={page >= totalPages || pending}
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs disabled:opacity-40"
              >
                Next
              </button>
            </>
          )}
        </div>
      </div>
      <BdDetailPanel bd={selected} onClose={() => setSelectedDn(null)} />
    </section>
  )
}
