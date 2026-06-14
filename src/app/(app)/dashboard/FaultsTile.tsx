import Link from 'next/link'
import { IconAlertTriangle } from '@tabler/icons-react'
import { getFaultCountSummary } from '@/actions/faults'

export async function FaultsTile() {
  const summary = await getFaultCountSummary()
  const totals = summary.reduce(
    (acc, h) => ({
      critical: acc.critical + h.critical,
      major: acc.major + h.major,
      minor: acc.minor + h.minor,
    }),
    { critical: 0, major: 0, minor: 0 },
  )

  return (
    <Link
      href="/faults"
      className="block rounded-2xl border border-border bg-card shadow-sm p-5 hover:border-foreground/20 transition-colors"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-sm font-semibold text-foreground">Faults</h3>
        <IconAlertTriangle size={16} stroke={1.75} className="text-muted-foreground" />
      </div>
      <div className="mt-4 flex items-baseline gap-4">
        <span className="text-2xl font-semibold text-red-600">{totals.critical}</span>
        <span className="text-lg font-semibold text-orange-500">{totals.major}</span>
        <span className="text-base font-medium text-amber-500">{totals.minor}</span>
      </div>
      <p className="text-xs text-subtle mt-1">critical / major / minor active faults</p>
    </Link>
  )
}
