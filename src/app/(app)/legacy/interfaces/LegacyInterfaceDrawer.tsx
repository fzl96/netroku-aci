'use client'

import { useEffect, useState } from 'react'
import { getLegacyInterfaceHistory, type LegacyInterfaceHistory } from '@/actions/legacy-interfaces'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { LegacyRange } from '@/lib/legacy-ui/query'
import type { LegacyInterfaceRow } from './LegacyInterfacesClient'
import { LegacyInterfaceTrendChart } from './LegacyInterfaceTrendChart'

function exactCounter(value: string | null): string {
  if (value === null) return '—'
  try { return BigInt(value).toLocaleString() } catch { return value }
}

export function LegacyInterfaceDrawer({ selected, onClose }: { selected: LegacyInterfaceRow | null; onClose: () => void }) {
  const [range, setRange] = useState<LegacyRange>('24h')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<{ key: string; data: LegacyInterfaceHistory | null; failed: boolean } | null>(null)
  const selectedId = selected?.id ?? null
  const requestKey = selectedId ? `${selectedId}:${range}:${page}` : null
  const isCurrentResult = requestKey !== null && result?.key === requestKey
  const data = isCurrentResult && !result.failed ? result.data : null
  const loading = requestKey !== null && !isCurrentResult
  const failed = isCurrentResult && result.failed

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    const activeRequestKey = `${selectedId}:${range}:${page}`
    getLegacyInterfaceHistory(selectedId, { range, page })
      .then(history => { if (!cancelled) setResult({ key: activeRequestKey, data: history, failed: false }) })
      .catch(() => { if (!cancelled) setResult({ key: activeRequestKey, data: null, failed: true }) })
    return () => { cancelled = true }
  }, [selectedId, range, page])

  function changeRange(next: LegacyRange) { setRange(next); setPage(1) }
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return <Sheet open={Boolean(selected)} onOpenChange={open => { if (!open) onClose() }}>
    <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-3xl">
      <SheetHeader className="border-b border-border"><SheetTitle className="font-serif">{selected?.hostname ?? 'Interface'} · {selected?.ifName}</SheetTitle><SheetDescription>{selected?.site} · exact counters and historical deltas</SheetDescription></SheetHeader>
      <div className="space-y-5 px-4 pb-8">
        <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">{(['24h', '7d', '30d', 'all'] as LegacyRange[]).map(value => <button key={value} onClick={() => changeRange(value)} className={`rounded-md px-3 py-1.5 text-xs ${range === value ? 'bg-card font-semibold text-foreground shadow-sm' : 'text-subtle'}`}>{value}</button>)}</div>
        {failed ? <div className="rounded-xl border border-error/30 bg-error/5 p-4 text-xs text-error">Could not load interface history. Change the range to retry.</div> : loading ? <div className="py-20 text-center text-xs text-subtle">Loading history…</div> : data && <>
          <section className="grid gap-2 text-xs sm:grid-cols-2"><div className="rounded-xl border border-border bg-muted/40 p-3"><p className="text-[10px] uppercase tracking-wide text-faint">Address</p><p className="mt-1 font-mono">{data.snapshot.ipAddress ? `${data.snapshot.ipAddress}${data.snapshot.prefixLength === null ? '' : `/${data.snapshot.prefixLength}`}` : 'Not assigned'}</p></div><div className="rounded-xl border border-border bg-muted/40 p-3"><p className="text-[10px] uppercase tracking-wide text-faint">Current state</p><p className="mt-1">Admin {data.snapshot.adminSt || 'unknown'} · Oper {data.snapshot.operSt || 'unknown'} · {data.snapshot.present ? 'present' : 'absent'}</p></div></section>
          <LegacyInterfaceTrendChart points={data.chart} />
          <section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Samples</h3><div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-xs"><thead className="bg-muted text-left text-faint"><tr>{['Collected', 'Admin', 'Oper', 'Speed', 'Input', 'Δ input', 'Output', 'Δ output', 'CRC', 'Δ CRC'].map(value => <th key={value} className="whitespace-nowrap px-3 py-2">{value}</th>)}</tr></thead><tbody>{data.samples.map(sample => <tr key={sample.id} className="border-t border-border"><td className="whitespace-nowrap px-3 py-2">{new Date(sample.collectedAt).toLocaleString()}</td><td className="px-3 py-2">{sample.adminSt || '—'}</td><td className="px-3 py-2">{sample.operSt || '—'}</td><td className="whitespace-nowrap px-3 py-2">{sample.speed || '—'}</td><td className="px-3 py-2 text-right font-mono">{exactCounter(sample.inputErrors)}</td><td className="px-3 py-2 text-right font-mono">{exactCounter(sample.dInputErrors)}</td><td className="px-3 py-2 text-right font-mono">{exactCounter(sample.outputErrors)}</td><td className="px-3 py-2 text-right font-mono">{exactCounter(sample.dOutputErrors)}</td><td className="px-3 py-2 text-right font-mono">{exactCounter(sample.crcErrors)}</td><td className="px-3 py-2 text-right font-mono">{exactCounter(sample.dCrcErrors)}</td></tr>)}</tbody></table></div><div className="mt-2 flex items-center justify-end gap-2 text-xs text-subtle"><button disabled={page <= 1} onClick={() => setPage(value => value - 1)} className="rounded border border-border px-2 py-1 disabled:opacity-30">Previous</button><span>{page} / {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage(value => value + 1)} className="rounded border border-border px-2 py-1 disabled:opacity-30">Next</button></div></section>
        </>}
      </div>
    </SheetContent>
  </Sheet>
}
