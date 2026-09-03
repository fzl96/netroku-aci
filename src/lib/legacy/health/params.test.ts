import { describe, expect, it } from 'bun:test'
import { buildLegacyHealthPageUrl, parseLegacyHealthPageParams } from './params'

describe('parseLegacyHealthPageParams', () => {
  it('applies defaults when nothing is supplied', () => {
    expect(parseLegacyHealthPageParams({})).toEqual({
      query: '', site: '', sort: 'collected', direction: 'desc', page: 1, pageSize: 50,
    })
  })

  it('takes the first value of a repeated key and trims whitespace', () => {
    expect(parseLegacyHealthPageParams({ query: ['  edge  ', 'other'] }).query).toBe('edge')
  })

  it('falls back to the default sort for unknown columns', () => {
    expect(parseLegacyHealthPageParams({ sort: 'hostname' }).sort).toBe('hostname')
    expect(parseLegacyHealthPageParams({ sort: 'nonsense' }).sort).toBe('collected')
  })

  it('rejects invalid pages and page sizes', () => {
    expect(parseLegacyHealthPageParams({ page: '0' }).page).toBe(1)
    expect(parseLegacyHealthPageParams({ pageSize: '17' }).pageSize).toBe(50)
  })
})

describe('buildLegacyHealthPageUrl', () => {
  it('omits defaults and preserves active filters', () => {
    const base = parseLegacyHealthPageParams({})
    expect(buildLegacyHealthPageUrl(base)).toBe('/legacy/health')
    expect(buildLegacyHealthPageUrl({
      ...base, query: 'edge', site: 'hq', sort: 'site', direction: 'asc', page: 2,
    })).toBe('/legacy/health?query=edge&site=hq&sort=site&dir=asc&page=2')
  })

  it('round-trips through the parser', () => {
    const params = parseLegacyHealthPageParams({ query: 'core', sort: 'managementIp', page: '3' })
    expect(parseLegacyHealthPageParams(Object.fromEntries(
      new URL(buildLegacyHealthPageUrl(params), 'http://x').searchParams,
    ))).toEqual(params)
  })
})
