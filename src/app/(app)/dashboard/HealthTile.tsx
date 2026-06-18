import Link from 'next/link'
import { IconActivityHeartbeat } from '@tabler/icons-react'
import { getHealthSummary } from '@/actions/health-scores'

function band(score: number | null): string {
  if (score === null) return 'text-muted-foreground'
  if (score >= 95) return 'text-green-600'
  if (score >= 80) return 'text-amber-500'
  return 'text-red-600'
}

export async function HealthTile() {
  const summary = await getHealthSummary()
  // Fabric-wide headline: lowest overall across hosts (worst fabric wins attention).
  const overalls = summary.map(h => h.overall).filter((s): s is number => s !== null)
  const overall = overalls.length > 0 ? Math.min(...overalls) : null
  const worsts = summary.map(h => h.worstScore).filter((s): s is number => s !== null)
  const worst = worsts.length > 0 ? Math.min(...worsts) : null

  return (
    <Link
      href="/health-scores"
      className="block rounded-2xl border border-border bg-card shadow-sm p-5 hover:border-foreground/20 transition-colors"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-sm font-semibold text-foreground">Health Scores</h3>
        <IconActivityHeartbeat size={16} stroke={1.75} className="text-muted-foreground" />
      </div>
      <div className="mt-4 flex items-baseline gap-4">
        <span className={`text-2xl font-semibold ${band(overall)}`}>{overall ?? '—'}</span>
        <span className="text-sm text-subtle">
          worst <span className={band(worst)}>{worst ?? '—'}</span>
        </span>
      </div>
      <p className="text-xs text-subtle mt-1">overall fabric / worst node or tenant</p>
    </Link>
  )
}
