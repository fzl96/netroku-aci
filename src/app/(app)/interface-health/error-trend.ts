// Pure helpers + config for the per-interface error-trend drawer.
// No React, no Prisma — keep this unit-testable.

export type ErrorTrendRange = '24h' | '7d' | '30d' | 'all'

export const DEFAULT_ERROR_TREND_RANGE: ErrorTrendRange = '7d'

export const ERROR_TREND_RANGES: { label: string; value: ErrorTrendRange }[] = [
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: 'All', value: 'all' },
]

// One plotted line per stored error/discard delta. `color` resolves via shadcn's
// ChartContainer, which injects `--color-<key>` CSS vars from the ChartConfig.
export const ERROR_TREND_SERIES = [
  { key: 'dRxErrors', label: 'Rx err', color: 'var(--chart-1)' },
  { key: 'dTxErrors', label: 'Tx err', color: 'var(--chart-2)' },
  { key: 'dRxCrcErrors', label: 'CRC', color: 'var(--chart-3)' },
  { key: 'dRxAlignErrors', label: 'Align', color: 'var(--chart-4)' },
  { key: 'dRxDiscards', label: 'Rx disc', color: 'var(--chart-5)' },
  // Falls back to a raw theme token — only 5 --chart-* slots exist, so no --chart-6.
  { key: 'dTxDiscards', label: 'Tx disc', color: 'var(--muted-foreground)' },
] as const

export type ErrorTrendKey = (typeof ERROR_TREND_SERIES)[number]['key']

export interface ErrorTrendPoint {
  sampledAt: string // ISO 8601
  dRxErrors: number | null
  dTxErrors: number | null
  dRxCrcErrors: number | null
  dRxAlignErrors: number | null
  dRxDiscards: number | null
  dTxDiscards: number | null
}

// Shape returned by the Prisma select in the server action.
export interface RawErrorSample {
  sampledAt: Date
  dRxErrors: bigint | null
  dTxErrors: bigint | null
  dRxCrcErrors: bigint | null
  dRxAlignErrors: bigint | null
  dRxDiscards: bigint | null
  dTxDiscards: bigint | null
}

const RANGE_MS: Record<Exclude<ErrorTrendRange, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

// Earliest sampledAt to include for a range, or null to include all history.
export function rangeToCutoff(range: ErrorTrendRange, now: Date): Date | null {
  if (range === 'all') return null
  return new Date(now.getTime() - RANGE_MS[range])
}

// Make Prisma rows safe to pass from a Server Action to a Client Component:
// BigInt -> number (error deltas are small — well below Number.MAX_SAFE_INTEGER / 2^53),
// Date -> ISO string. Nulls preserved.
export function serializeErrorSamples(rows: RawErrorSample[]): ErrorTrendPoint[] {
  const toNum = (v: bigint | null) => (v === null ? null : Number(v))
  return rows.map((r) => ({
    sampledAt: r.sampledAt.toISOString(),
    dRxErrors: toNum(r.dRxErrors),
    dTxErrors: toNum(r.dTxErrors),
    dRxCrcErrors: toNum(r.dRxCrcErrors),
    dRxAlignErrors: toNum(r.dRxAlignErrors),
    dRxDiscards: toNum(r.dRxDiscards),
    dTxDiscards: toNum(r.dTxDiscards),
  }))
}

// ─── Reset / gap detection for the trend chart ──────────────────────────────
// A delta is null in two distinct situations the chart must not conflate:
//  • counter reset  — a series value transitions non-null → null (computeDelta
//    returns null when the raw counter drops). The line already breaks here.
//  • monitoring gap — samples are missing for a stretch, so two *non-null*
//    points sit far apart in time; a naive line bridges them, faking continuity.
// These helpers surface both so the chart can mark resets and break gaps.

const DELTA_KEYS = ERROR_TREND_SERIES.map((s) => s.key)

// Multiple of the median sample interval above which a gap counts as a
// monitoring outage rather than normal cadence jitter.
export const GAP_INTERVAL_FACTOR = 3

export interface GapSegment {
  x1: string // sampledAt of the last point before the gap
  x2: string // sampledAt of the first point after the gap
  mid: string // synthetic midpoint timestamp used to break the line
}

/**
 * Timestamps where a counter reset occurred: any plotted series transitions
 * from a non-null value to null (index > 0). Deduped, chronological. The very
 * first sample (leading null) is never a reset.
 */
export function findResetTimestamps(points: ErrorTrendPoint[]): string[] {
  const out: string[] = []
  for (let i = 1; i < points.length; i++) {
    const isReset = DELTA_KEYS.some(
      (k) => points[i][k] === null && points[i - 1][k] !== null,
    )
    if (isReset) out.push(points[i].sampledAt)
  }
  return out
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Detect monitoring gaps: consecutive samples whose spacing exceeds
 * `factor` × the median interval. Needs at least 4 points to establish a
 * stable cadence; otherwise returns no gaps.
 */
export function findGapSegments(
  points: ErrorTrendPoint[],
  factor: number = GAP_INTERVAL_FACTOR,
): GapSegment[] {
  if (points.length < 4) return []
  const times = points.map((p) => new Date(p.sampledAt).getTime())
  const intervals: number[] = []
  for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1])
  const threshold = median(intervals) * factor
  if (threshold <= 0) return []

  const gaps: GapSegment[] = []
  for (let i = 1; i < points.length; i++) {
    if (times[i] - times[i - 1] > threshold) {
      gaps.push({
        x1: points[i - 1].sampledAt,
        x2: points[i].sampledAt,
        mid: new Date((times[i - 1] + times[i]) / 2).toISOString(),
      })
    }
  }
  return gaps
}

/**
 * Insert an all-null filler point at each gap midpoint and return the merged
 * series sorted by time, so a `connectNulls={false}` line breaks across a
 * monitoring outage instead of bridging it. Original points are untouched.
 */
export function insertGapBreaks(
  points: ErrorTrendPoint[],
  gaps: GapSegment[],
): ErrorTrendPoint[] {
  if (gaps.length === 0) return points
  const fillers: ErrorTrendPoint[] = gaps.map((g) => ({
    sampledAt: g.mid,
    dRxErrors: null,
    dTxErrors: null,
    dRxCrcErrors: null,
    dRxAlignErrors: null,
    dRxDiscards: null,
    dTxDiscards: null,
  }))
  return [...points, ...fillers].sort(
    (a, b) => new Date(a.sampledAt).getTime() - new Date(b.sampledAt).getTime(),
  )
}
