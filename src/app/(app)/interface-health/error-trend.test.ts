import { describe, expect, it } from 'bun:test'
import {
  rangeToCutoff,
  serializeErrorSamples,
  findResetTimestamps,
  findGapSegments,
  insertGapBreaks,
  type ErrorTrendPoint,
} from './error-trend'

// Build an ErrorTrendPoint with all deltas defaulting to 0, overriding some.
function pt(
  sampledAt: string,
  over: Partial<Omit<ErrorTrendPoint, 'sampledAt'>> = {},
): ErrorTrendPoint {
  return {
    sampledAt,
    dRxErrors: 0,
    dTxErrors: 0,
    dRxCrcErrors: 0,
    dRxAlignErrors: 0,
    dRxDiscards: 0,
    dTxDiscards: 0,
    ...over,
  }
}

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

describe('findResetTimestamps', () => {
  it('flags points where a series drops from non-null to null', () => {
    const points = [
      pt('2026-07-10T00:00:00.000Z', { dRxCrcErrors: 5 }),
      pt('2026-07-10T01:00:00.000Z', { dRxCrcErrors: 3 }),
      pt('2026-07-10T02:00:00.000Z', { dRxCrcErrors: null }), // reset here
      pt('2026-07-10T03:00:00.000Z', { dRxCrcErrors: 8 }),
    ]
    expect(findResetTimestamps(points)).toEqual(['2026-07-10T02:00:00.000Z'])
  })

  it('does not flag a leading null (first sample)', () => {
    const points = [
      pt('2026-07-10T00:00:00.000Z', { dRxErrors: null, dRxCrcErrors: null }),
      pt('2026-07-10T01:00:00.000Z', { dRxErrors: 2 }),
    ]
    expect(findResetTimestamps(points)).toEqual([])
  })

  it('flags a timestamp once even when several series reset together', () => {
    const points = [
      pt('2026-07-10T00:00:00.000Z', { dRxErrors: 4, dRxCrcErrors: 4 }),
      pt('2026-07-10T01:00:00.000Z', { dRxErrors: null, dRxCrcErrors: null }),
    ]
    expect(findResetTimestamps(points)).toEqual(['2026-07-10T01:00:00.000Z'])
  })
})

describe('findGapSegments', () => {
  it('returns no gaps for evenly-spaced samples', () => {
    const points = [
      pt('2026-07-10T00:00:00.000Z'),
      pt('2026-07-10T01:00:00.000Z'),
      pt('2026-07-10T02:00:00.000Z'),
      pt('2026-07-10T03:00:00.000Z'),
      pt('2026-07-10T04:00:00.000Z'),
    ]
    expect(findGapSegments(points)).toEqual([])
  })

  it('detects a gap larger than factor × median interval', () => {
    const points = [
      pt('2026-07-10T00:00:00.000Z'),
      pt('2026-07-10T01:00:00.000Z'),
      pt('2026-07-10T02:00:00.000Z'),
      pt('2026-07-11T02:00:00.000Z'), // 24h gap vs 1h median
      pt('2026-07-11T03:00:00.000Z'),
    ]
    expect(findGapSegments(points)).toEqual([
      {
        x1: '2026-07-10T02:00:00.000Z',
        x2: '2026-07-11T02:00:00.000Z',
        mid: '2026-07-10T14:00:00.000Z',
      },
    ])
  })

  it('returns no gaps when there are too few points to establish cadence', () => {
    const points = [
      pt('2026-07-10T00:00:00.000Z'),
      pt('2026-07-12T00:00:00.000Z'),
    ]
    expect(findGapSegments(points)).toEqual([])
  })
})

describe('insertGapBreaks', () => {
  it('inserts an all-null filler at each gap midpoint, sorted by time', () => {
    const points = [
      pt('2026-07-10T00:00:00.000Z', { dRxErrors: 1 }),
      pt('2026-07-11T00:00:00.000Z', { dRxErrors: 2 }),
    ]
    const gaps = [
      {
        x1: '2026-07-10T00:00:00.000Z',
        x2: '2026-07-11T00:00:00.000Z',
        mid: '2026-07-10T12:00:00.000Z',
      },
    ]
    const out = insertGapBreaks(points, gaps)
    expect(out.map((p) => p.sampledAt)).toEqual([
      '2026-07-10T00:00:00.000Z',
      '2026-07-10T12:00:00.000Z',
      '2026-07-11T00:00:00.000Z',
    ])
    expect(out[1]).toEqual({
      sampledAt: '2026-07-10T12:00:00.000Z',
      dRxErrors: null,
      dTxErrors: null,
      dRxCrcErrors: null,
      dRxAlignErrors: null,
      dRxDiscards: null,
      dTxDiscards: null,
    })
  })

  it('returns the original points unchanged when there are no gaps', () => {
    const points = [pt('2026-07-10T00:00:00.000Z')]
    expect(insertGapBreaks(points, [])).toBe(points)
  })
})
