'use client'

import { useEffect, useState } from 'react'
import { getLegacyHealthHistory, type LegacyHealthHistory } from '@/actions/legacy-health'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { LegacyRange } from '@/lib/legacy-ui/query'
import type { LegacyHealthRow } from './LegacyHealthClient'
import { LegacyHealthTrendChart } from './LegacyHealthTrendChart'

function metric(value: number | null, suffix = '%') { return value === null ? '—' : `${value.toFixed(1)}${suffix}` }

export function LegacyHealthDrawer({ selected, onClose }: { selected: LegacyHealthRow | null; onClose: () => void }) {
  const [range, setRange] = useState<LegacyRange>('24h')
  const [result, setResult] = useState<{
    key: string
    data: LegacyHealthHistory | null
    failed: boolean
  } | null>(null)
  const [samplePage, setSamplePage] = useState(1)
  const [logPage, setLogPage] = useState(1)
  const requestKey = selected
    ? `${selected.deviceId}:${range}:${samplePage}:${logPage}`
    : null
  const isCurrentResult = requestKey !== null && result?.key === requestKey
  const data = isCurrentResult && !result.failed ? result.data : null
  const loading = requestKey !== null && !isCurrentResult
  const failed = isCurrentResult && result.failed

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    const activeRequestKey = `${selected.deviceId}:${range}:${samplePage}:${logPage}`
    getLegacyHealthHistory(selected.deviceId, { range, samplePage, logPage })
      .then(history => {
        if (!cancelled) setResult({ key: activeRequestKey, data: history, failed: false })
      })
      .catch(() => {
        if (!cancelled) setResult({ key: activeRequestKey, data: null, failed: true })
      })
    return () => { cancelled = true }
  }, [selected, range, samplePage, logPage])

  function changeRange(next: LegacyRange) { setRange(next); setSamplePage(1); setLogPage(1) }

  return (
    <Sheet open={Boolean(selected)} onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader className="border-b border-border"><SheetTitle className="font-serif">{selected?.hostname ?? 'Health history'}</SheetTitle><SheetDescription>{selected?.site} · collected measurements and logs</SheetDescription></SheetHeader>
        <div className="space-y-5 px-4 pb-8">
          <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">
            {(['24h', '7d', '30d', 'all'] as LegacyRange[]).map(value => <button key={value} onClick={() => changeRange(value)} className={`rounded-md px-3 py-1.5 text-xs ${range === value ? 'bg-card font-semibold text-foreground shadow-sm' : 'text-subtle'}`}>{value}</button>)}
          </div>
          {failed ? <div className="rounded-xl border border-error/30 bg-error/5 p-4 text-xs text-error">Could not load health history. Change the range to retry.</div> : loading ? <div className="py-20 text-center text-xs text-subtle">Loading history…</div> : data && <>
            <LegacyHealthTrendChart points={data.chart} />
            <section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Samples</h3><div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-xs"><thead className="bg-muted text-left text-faint"><tr>{['Collected', 'CPU', 'Memory', 'Storage', 'Temp', 'Fans', 'PSUs'].map(v => <th key={v} className="px-3 py-2">{v}</th>)}</tr></thead><tbody>{data.samples.map(row => <tr key={row.id} className="border-t border-border"><td className="whitespace-nowrap px-3 py-2">{new Date(row.collectedAt).toLocaleString()}</td><td className="px-3 py-2">{metric(row.cpuPercent)}</td><td className="px-3 py-2">{metric(row.memoryPercent)}</td><td className="px-3 py-2">{metric(row.storagePercent)}</td><td className="px-3 py-2">{metric(row.temperatureCelsius, '°C')}</td><td className="px-3 py-2">{row.fanStatuses.join(', ') || '—'}</td><td className="px-3 py-2">{row.psuStatuses.join(', ') || '—'}</td></tr>)}</tbody></table></div><Pager page={samplePage} total={data.sampleTotal} size={data.pageSize} onPage={setSamplePage} /></section>
            <section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Logs</h3><div className="space-y-2">{data.logs.length === 0 ? <p className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-subtle">No logs in this range</p> : data.logs.map(log => <div key={log.id} className="rounded-xl border border-border bg-card p-3"><div className="flex justify-between gap-3 text-[10px] text-faint"><span>{log.severity || 'UNCLASSIFIED'}</span><time>{new Date(log.eventAt || log.collectedAt).toLocaleString()}</time></div><p className="mt-1 text-xs text-foreground">{log.message}</p><details className="mt-2 text-[10px] text-subtle"><summary>Raw event</summary><pre className="mt-1 whitespace-pre-wrap break-words">{log.raw}</pre></details></div>)}</div><Pager page={logPage} total={data.logTotal} size={data.pageSize} onPage={setLogPage} /></section>
          </>}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Pager({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size))
  return <div className="mt-2 flex items-center justify-end gap-2 text-xs text-subtle"><button disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded border border-border px-2 py-1 disabled:opacity-30">Previous</button><span>{page} / {pages}</span><button disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded border border-border px-2 py-1 disabled:opacity-30">Next</button></div>
}
