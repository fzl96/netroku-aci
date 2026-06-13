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
// BigInt -> number (error deltas are small), Date -> ISO string. Nulls preserved.
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
