import { describe, expect, it } from 'bun:test'
import {
  legacyRangeCutoff,
  parseLegacyOptionalPage,
  parseLegacyPage,
  parseLegacyPageSize,
  parseLegacyList,
  parseLegacyRange,
} from './query'

describe('legacy list query parsing', () => {
  it('clamps pages and accepts only supported page sizes', () => {
    expect(parseLegacyPage('-3')).toBe(1)
    expect(parseLegacyPage('4')).toBe(4)
    expect(parseLegacyPage('nope')).toBe(1)
    expect(parseLegacyPageSize('100')).toBe(100)
    expect(parseLegacyPageSize('999')).toBe(50)
  })

  it('validates history ranges', () => {
    expect(parseLegacyRange('all')).toBe('all')
    expect(parseLegacyRange('nope')).toBe('24h')
  })

  it('reads list params from repeated keys or comma-joined values', () => {
    expect(parseLegacyList(undefined)).toEqual([])
    expect(parseLegacyList('')).toEqual([])
    expect(parseLegacyList(' hq , dc1 ')).toEqual(['dc1', 'hq'])
    expect(parseLegacyList(['hq', 'dc1,hq'])).toEqual(['dc1', 'hq'])
    expect(parseLegacyList('vlan10,vlan9')).toEqual(['vlan9', 'vlan10'])
  })

  it('leaves an optional detail page absent rather than defaulting it', () => {
    expect(parseLegacyOptionalPage(null)).toBeUndefined()
    expect(parseLegacyOptionalPage('nope')).toBeUndefined()
    expect(parseLegacyOptionalPage('3')).toBe(3)
  })

  it('builds fixed history cutoffs and leaves all unbounded', () => {
    const now = new Date('2026-07-21T12:00:00.000Z')
    expect(legacyRangeCutoff('24h', now)?.toISOString()).toBe('2026-07-20T12:00:00.000Z')
    expect(legacyRangeCutoff('7d', now)?.toISOString()).toBe('2026-07-14T12:00:00.000Z')
    expect(legacyRangeCutoff('30d', now)?.toISOString()).toBe('2026-06-21T12:00:00.000Z')
    expect(legacyRangeCutoff('all', now)).toBeNull()
  })
})
