import { describe, expect, it } from 'bun:test'
import { aggregateCrcTrend } from './crc-trend'

describe('aggregateCrcTrend', () => {
  it('aggregates dRxCrcErrors by sampledAt timestamp', () => {
    const t1 = new Date('2026-07-10T10:00:00Z')
    const t2 = new Date('2026-07-10T11:00:00Z')

    const samples = [
      { sampledAt: t1, dRxCrcErrors: BigInt(5) },
      { sampledAt: t1, dRxCrcErrors: BigInt(3) },
      { sampledAt: t2, dRxCrcErrors: BigInt(12) },
      { sampledAt: t2, dRxCrcErrors: null },
    ]

    const result = aggregateCrcTrend(samples)
    expect(result).toEqual([
      { sampledAt: t1.toISOString(), crcErrorsDelta: 8 },
      { sampledAt: t2.toISOString(), crcErrorsDelta: 12 },
    ])
  })

  it('handles empty samples gracefully', () => {
    expect(aggregateCrcTrend([])).toEqual([])
  })
})
