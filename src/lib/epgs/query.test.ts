import { describe, expect, it } from 'bun:test'
import {
  buildEpgWhere,
  buildBindingWhere,
  countActiveEpgFilterGroups,
  expandNodeOptions,
} from './query'

describe('buildEpgWhere', () => {
  it('scopes to host and maps filters', () => {
    const where = buildEpgWhere('h1', {
      tenant: ['t1'],
      ap: ['ap1'],
      query: 'web',
    })
    expect(where.apicHostId).toBe('h1')
    expect(where.tenant).toEqual({ in: ['t1'] })
    expect(where.appProfile).toEqual({ in: ['ap1'] })
    expect(where.OR).toBeDefined()
  })
})

describe('buildBindingWhere', () => {
  it('matches a leaf inside vPC pairs', () => {
    const where = buildBindingWhere('h1', { node: ['101'] })
    expect(where.AND).toEqual([
      {
        OR: [
          { node: '101' },
          { node: { startsWith: '101-' } },
          { node: { endsWith: '-101' } },
        ],
      },
    ])
  })

  it('applies tenant/ap through the epg relation', () => {
    const where = buildBindingWhere('h1', { tenant: ['t1'], ap: ['ap1'] })
    expect(where.epg).toEqual({ tenant: { in: ['t1'] }, appProfile: { in: ['ap1'] } })
  })
})

describe('countActiveEpgFilterGroups', () => {
  it('counts non-empty filter groups', () => {
    expect(countActiveEpgFilterGroups({})).toBe(0)
    expect(countActiveEpgFilterGroups({ tenant: ['t'], node: ['101'] })).toBe(2)
  })
})

describe('expandNodeOptions', () => {
  it('splits pairs, dedupes and natural-sorts', () => {
    expect(expandNodeOptions(['101-102', '101', '99', '3113-3114'])).toEqual(
      ['99', '101', '102', '3113', '3114'],
    )
  })
})
