import { describe, expect, it } from 'bun:test'
import {
  legacyRangeCutoff,
  parseLegacyPage,
  parseLegacyPageSize,
  parseLegacyRange,
  parseLegacySort,
} from './query'

describe('legacy list query parsing', () => {
  it('clamps pages and accepts only supported page sizes', () => {
    expect(parseLegacyPage('-3')).toBe(1)
    expect(parseLegacyPage('4')).toBe(4)
    expect(parseLegacyPage('nope')).toBe(1)
    expect(parseLegacyPageSize('100')).toBe(100)
    expect(parseLegacyPageSize('999')).toBe(50)
  })

  it('validates history ranges and sort values', () => {
    expect(parseLegacyRange('all')).toBe('all')
    expect(parseLegacyRange('nope')).toBe('24h')
    expect(parseLegacySort('hostname', ['hostname', 'site'] as const, 'site')).toBe('hostname')
    expect(parseLegacySort('model', ['hostname', 'site'] as const, 'site')).toBe('site')
  })

  it('builds fixed history cutoffs and leaves all unbounded', () => {
    const now = new Date('2026-07-21T12:00:00.000Z')
    expect(legacyRangeCutoff('24h', now)?.toISOString()).toBe('2026-07-20T12:00:00.000Z')
    expect(legacyRangeCutoff('7d', now)?.toISOString()).toBe('2026-07-14T12:00:00.000Z')
    expect(legacyRangeCutoff('30d', now)?.toISOString()).toBe('2026-06-21T12:00:00.000Z')
    expect(legacyRangeCutoff('all', now)).toBeNull()
  })
})
