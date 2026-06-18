import { describe, expect, it } from 'bun:test'
import { rangeToCutoff, serializeErrorSamples } from './error-trend'

describe('rangeToCutoff', () => {
  const now = new Date('2026-06-13T12:00:00.000Z')

  it('returns null for "all"', () => {
    expect(rangeToCutoff('all', now)).toBeNull()
  })

  it('subtracts 24 hours for "24h"', () => {
    expect(rangeToCutoff('24h', now)?.toISOString()).toBe('2026-06-12T12:00:00.000Z')
  })

  it('subtracts 7 days for "7d"', () => {
    expect(rangeToCutoff('7d', now)?.toISOString()).toBe('2026-06-06T12:00:00.000Z')
  })

  it('subtracts 30 days for "30d"', () => {
    expect(rangeToCutoff('30d', now)?.toISOString()).toBe('2026-05-14T12:00:00.000Z')
  })
})

describe('serializeErrorSamples', () => {
  it('converts BigInt deltas to numbers and dates to ISO strings', () => {
    const out = serializeErrorSamples([
      {
        sampledAt: new Date('2026-06-13T00:00:00.000Z'),
        dRxErrors: 5n,
        dTxErrors: 0n,
        dRxCrcErrors: 2n,
        dRxAlignErrors: 0n,
        dRxDiscards: 7n,
        dTxDiscards: 1n,
      },
    ])
    expect(out).toEqual([
      {
        sampledAt: '2026-06-13T00:00:00.000Z',
        dRxErrors: 5,
        dTxErrors: 0,
        dRxCrcErrors: 2,
        dRxAlignErrors: 0,
        dRxDiscards: 7,
        dTxDiscards: 1,
      },
    ])
  })

  it('preserves nulls (first sample / counter reset) instead of coercing to 0', () => {
    const out = serializeErrorSamples([
      {
        sampledAt: new Date('2026-06-13T00:00:00.000Z'),
        dRxErrors: null,
        dTxErrors: null,
        dRxCrcErrors: null,
        dRxAlignErrors: null,
        dRxDiscards: null,
        dTxDiscards: null,
      },
    ])
    expect(out[0]).toEqual({
      sampledAt: '2026-06-13T00:00:00.000Z',
      dRxErrors: null,
      dTxErrors: null,
      dRxCrcErrors: null,
      dRxAlignErrors: null,
      dRxDiscards: null,
      dTxDiscards: null,
    })
  })
})
