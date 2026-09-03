import { LegacyHealthReadError, getLegacyHealthSummary } from '@/lib/legacy/health/query'
import { LegacyHealthRegionError } from './health-region-error'

export async function LegacyHealthSummary() {
  let summary: Awaited<ReturnType<typeof getLegacyHealthSummary>>
  try {
    summary = await getLegacyHealthSummary()
  } catch (error) {
    if (!(error instanceof LegacyHealthReadError)) throw error
    console.error('[legacy-health] failed to load summary', error)
    return <LegacyHealthRegionError region="summary" />
  }

  const cards = [
    ['Monitored devices', String(summary.devices)],
    ['Health samples', String(summary.samples)],
    ['Collected logs', String(summary.logs)],
    ['Latest collection', summary.latest ? new Date(summary.latest).toLocaleString() : 'Never'],
  ] as const

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{label}</p>
          <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
        </div>
      ))}
    </div>
  )
}
