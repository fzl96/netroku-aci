import { describe, expect, it } from 'bun:test'
import { fmtDate, fmtRelative } from './format'

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('fmtRelative', () => {
  it('names an absent timestamp rather than rendering a dash', () => {
    expect(fmtRelative(null)).toBe('never')
  })

  it('steps from minutes to hours to days', () => {
    expect(fmtRelative(ago(30_000))).toBe('just now')
    expect(fmtRelative(ago(5 * MINUTE))).toBe('5m ago')
    expect(fmtRelative(ago(3 * HOUR))).toBe('3h ago')
    // Hours run to two days before the unit changes, so a stale port reads as
    // "36h ago" rather than a rounded-down "1d ago".
    expect(fmtRelative(ago(36 * HOUR))).toBe('36h ago')
    expect(fmtRelative(ago(5 * DAY))).toBe('5d ago')
  })
})

describe('fmtDate', () => {
  it('falls back to a dash when there is no timestamp', () => {
    expect(fmtDate(null)).toBe('—')
  })

  it('renders a stored ISO string in local time', () => {
    const date = new Date('2026-07-01T10:00:00Z')
    expect(fmtDate(date.toISOString())).toBe(date.toLocaleString())
  })
})
