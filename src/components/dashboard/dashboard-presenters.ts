import type { PostureTone } from '@/lib/dashboard/summary'

export function formatDashboardNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

export function formatDashboardPercent(value: number, total: number): string {
  if (total === 0) return '-'
  return `${Math.round((value / total) * 100)}%`
}

export function latestDashboardDate(values: Array<string | null>): string | null {
  let latest: string | null = null
  let latestTime = Number.NEGATIVE_INFINITY
  for (const value of values) {
    if (!value) continue
    const timestamp = new Date(value).getTime()
    if (!Number.isNaN(timestamp) && timestamp > latestTime) {
      latest = value
      latestTime = timestamp
    }
  }
  return latest
}

export function dashboardToneTextClass(tone: PostureTone): string {
  if (tone === 'critical') return 'text-error'
  if (tone === 'warning') return 'text-warning'
  if (tone === 'healthy') return 'text-success'
  return 'text-muted-foreground'
}

export function dashboardToneSurfaceClass(tone: PostureTone): string {
  if (tone === 'critical') return 'border-error-border bg-error-bg text-error'
  if (tone === 'warning') return 'border-warning-border bg-warning-bg text-warning'
  if (tone === 'healthy') return 'border-success-border bg-success-bg text-success'
  return 'border-border bg-muted text-muted-foreground'
}
