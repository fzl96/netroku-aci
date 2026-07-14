export interface CrcTrendPoint {
  sampledAt: string // ISO date string
  crcErrorsDelta: number
}

export interface RawCrcSample {
  sampledAt: Date
  dRxCrcErrors: bigint | null
}

/**
 * Filter and aggregate raw interface samples into time-series data points for CRC error trend chart.
 * Groups by sample timestamp and sums dRxCrcErrors (converting BigInt -> Number).
 */
export function aggregateCrcTrend(samples: RawCrcSample[]): CrcTrendPoint[] {
  const byTime = new Map<string, number>()

  for (const s of samples) {
    if (s.dRxCrcErrors === null) continue
    const delta = Number(s.dRxCrcErrors)
    if (delta < 0) continue // ignore invalid negative deltas

    const key = s.sampledAt.toISOString()
    const current = byTime.get(key) ?? 0
    byTime.set(key, current + delta)
  }

  // Sort timestamps chronologically
  const sortedTimes = Array.from(byTime.keys()).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime(),
  )

  return sortedTimes.map(sampledAt => ({
    sampledAt,
    crcErrorsDelta: byTime.get(sampledAt) ?? 0,
  }))
}
