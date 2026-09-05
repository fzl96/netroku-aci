import {
  LegacyInterfaceReadError,
  type LegacyInterfaceSummary as LegacyInterfaceSummaryData,
} from '@/lib/legacy/interfaces/query'
import { LegacyInterfaceRegionError } from './interface-region-error'

export async function LegacyInterfaceSummary({
  summaryPromise,
}: {
  summaryPromise: Promise<LegacyInterfaceSummaryData>
}) {
  let summary: LegacyInterfaceSummaryData
  try {
    summary = await summaryPromise
  } catch (error) {
    if (!(error instanceof LegacyInterfaceReadError)) throw error
    console.error('[legacy-interfaces] failed to load summary', error)
    return <LegacyInterfaceRegionError region="summary" />
  }

  const cards = [
    ['Interfaces', summary.total],
    ['Operational down', summary.down],
    ['No longer present', summary.absent],
    ['With history', summary.withHistory],
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
