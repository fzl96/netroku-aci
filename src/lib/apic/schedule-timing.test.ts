import { describe, expect, it } from 'bun:test'
import {
  DEFAULT_INTERVAL_MINUTES,
  INTERVAL_MAX_MINUTES,
  INTERVAL_MIN_MINUTES,
  STALE_CLAIM_MINUTES,
  computeNextRunAt,
  isClaimStale,
  isScheduleDue,
  isScheduleOverdue,
} from './schedule-timing'

const T0 = new Date('2026-08-17T12:00:00.000Z')
const min = (n: number) => new Date(T0.getTime() + n * 60_000)

describe('constants', () => {
  it('matches the spec bounds', () => {
    expect(INTERVAL_MIN_MINUTES).toBe(15)
    expect(INTERVAL_MAX_MINUTES).toBe(10080)
    expect(DEFAULT_INTERVAL_MINUTES).toBe(480)
    expect(STALE_CLAIM_MINUTES).toBe(120)
  })
})

describe('computeNextRunAt', () => {
  it('adds the interval to the completion time', () => {
    expect(computeNextRunAt(T0, 480).toISOString()).toBe('2026-08-17T20:00:00.000Z')
  })

  it('measures from completion, not from the scheduled time', () => {
    const lateCompletion = min(37)
    expect(computeNextRunAt(lateCompletion, 60).toISOString()).toBe('2026-08-17T13:37:00.000Z')
  })

  it('throws on a non-positive interval', () => {
    expect(() => computeNextRunAt(T0, 0)).toThrow()
    expect(() => computeNextRunAt(T0, -5)).toThrow()
  })
})

describe('isClaimStale', () => {
  it('treats an unclaimed row as not stale', () => {
    expect(isClaimStale(null, T0)).toBe(false)
  })

  it('is false just inside the window', () => {
    expect(isClaimStale(T0, min(119))).toBe(false)
  })

  it('is false exactly at the boundary', () => {
    expect(isClaimStale(T0, min(120))).toBe(false)
  })

  it('is true just outside the window', () => {
    expect(isClaimStale(T0, min(121))).toBe(true)
  })

  it('honours a custom window', () => {
    expect(isClaimStale(T0, min(31), 30)).toBe(true)
    expect(isClaimStale(T0, min(29), 30)).toBe(false)
  })
})

describe('isScheduleDue', () => {
  const base = { enabled: true, nextRunAt: T0, runningAt: null }

  it('is due when nextRunAt has passed', () => {
    expect(isScheduleDue(base, min(1))).toBe(true)
  })

  it('is due exactly at nextRunAt', () => {
    expect(isScheduleDue(base, T0)).toBe(true)
  })

  it('is not due before nextRunAt', () => {
    expect(isScheduleDue(base, min(-1))).toBe(false)
  })

  it('is never due when disabled', () => {
    expect(isScheduleDue({ ...base, enabled: false }, min(60))).toBe(false)
  })

  it('is not due when nextRunAt is null', () => {
    expect(isScheduleDue({ ...base, nextRunAt: null }, min(60))).toBe(false)
  })

  it('is not due while a fresh claim is held', () => {
    expect(isScheduleDue({ ...base, runningAt: min(5) }, min(10))).toBe(false)
  })

  it('becomes due again once the claim goes stale', () => {
    expect(isScheduleDue({ ...base, runningAt: T0 }, min(121))).toBe(true)
  })
})

describe('isScheduleOverdue', () => {
  const base = { enabled: true, nextRunAt: T0, intervalMinutes: 60 }

  it('is not overdue within 2x the interval', () => {
    expect(isScheduleOverdue(base, min(119))).toBe(false)
  })

  it('is overdue past 2x the interval', () => {
    expect(isScheduleOverdue(base, min(121))).toBe(true)
  })

  it('is never overdue when disabled', () => {
    expect(isScheduleOverdue({ ...base, enabled: false }, min(10_000))).toBe(false)
  })

  it('is not overdue when never scheduled', () => {
    expect(isScheduleOverdue({ ...base, nextRunAt: null }, min(10_000))).toBe(false)
  })
})
