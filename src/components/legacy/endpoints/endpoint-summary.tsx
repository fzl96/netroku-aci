import {
  LegacyEndpointReadError,
  type LegacyEndpointSummary as LegacyEndpointSummaryData,
} from '@/lib/legacy/endpoints/query'
import { LegacyEndpointRegionError } from './endpoint-region-error'

export async function LegacyEndpointSummary({
  summaryPromise,
}: {
  summaryPromise: Promise<LegacyEndpointSummaryData>
}) {
  let summary: LegacyEndpointSummaryData
  try {
    summary = await summaryPromise
  } catch (error) {
    if (!(error instanceof LegacyEndpointReadError)) throw error
    console.error('[legacy-endpoints] failed to load summary', error)
    return <LegacyEndpointRegionError region="summary" />
  }

  const cards = [
    ['Endpoint records', summary.total],
    ['Active', summary.active],
    ['Historical', summary.historical],
    ['VLANs', summary.vlans],
  ] as const

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
        </div>
      ))}
    </div>
  )
}
