import { describe, expect, it } from 'bun:test'
import { buildLegacyHealthPageUrl, parseLegacyHealthPageParams } from './params'

describe('parseLegacyHealthPageParams', () => {
  it('applies defaults when nothing is supplied', () => {
    expect(parseLegacyHealthPageParams({})).toEqual({
      query: '',
      sites: [],
      page: 1,
      pageSize: 50,
    })
  })

  it('takes the first value of a repeated query key and trims whitespace', () => {
    expect(parseLegacyHealthPageParams({ query: ['  edge  ', 'other'] }).query).toBe('edge')
  })

  it('collects every selected site', () => {
    expect(parseLegacyHealthPageParams({ site: ' hq , dc1 ' }).sites).toEqual(['dc1', 'hq'])
  })

  it('rejects invalid pages and page sizes', () => {
    expect(parseLegacyHealthPageParams({ page: '0' }).page).toBe(1)
    expect(parseLegacyHealthPageParams({ pageSize: '17' }).pageSize).toBe(50)
  })

  it('ignores the retired sort parameters a bookmarked URL may still carry', () => {
    const bookmarked = Object.fromEntries(new URLSearchParams('sort=hostname&dir=asc'))
    expect(parseLegacyHealthPageParams(bookmarked)).toEqual(parseLegacyHealthPageParams({}))
  })
})

describe('buildLegacyHealthPageUrl', () => {
  it('omits defaults and preserves active filters', () => {
    const base = parseLegacyHealthPageParams({})
    expect(buildLegacyHealthPageUrl(base)).toBe('/legacy/health')
    expect(
      buildLegacyHealthPageUrl({ ...base, query: 'edge', sites: ['hq', 'dc1'], page: 2 }),
    ).toBe('/legacy/health?query=edge&site=hq%2Cdc1&page=2')
  })

  it('round-trips through the parser', () => {
    const params = parseLegacyHealthPageParams({ query: 'core', site: 'dc1,hq', page: '3' })
    expect(
      parseLegacyHealthPageParams(
        Object.fromEntries(new URL(buildLegacyHealthPageUrl(params), 'http://x').searchParams),
      ),
    ).toEqual(params)
  })
})
