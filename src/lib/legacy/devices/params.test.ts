import { describe, expect, it } from 'bun:test'
import { buildLegacyDevicePageUrl, parseLegacyDevicePageParams } from './params'

describe('parseLegacyDevicePageParams', () => {
  it('applies defaults when nothing is supplied', () => {
    expect(parseLegacyDevicePageParams({})).toEqual({
      query: '',
      sites: [],
      deviceTypes: [],
      page: 1,
      pageSize: 50,
    })
  })

  it('takes the first value of a repeated query key and trims whitespace', () => {
    expect(parseLegacyDevicePageParams({ query: ['  edge  ', 'ignored'] }).query).toBe('edge')
  })

  it('collects every selected site and device type', () => {
    const params = parseLegacyDevicePageParams({
      site: '  hq , dc1 ',
      deviceType: ['switch', 'router,switch'],
    })
    expect(params.sites).toEqual(['dc1', 'hq'])
    expect(params.deviceTypes).toEqual(['router', 'switch'])
  })

  it('rejects invalid pages and page sizes', () => {
    expect(parseLegacyDevicePageParams({ page: '0' }).page).toBe(1)
    expect(parseLegacyDevicePageParams({ page: 'abc' }).page).toBe(1)
    expect(parseLegacyDevicePageParams({ page: '7' }).page).toBe(7)
    expect(parseLegacyDevicePageParams({ pageSize: '17' }).pageSize).toBe(50)
    expect(parseLegacyDevicePageParams({ pageSize: '100' }).pageSize).toBe(100)
  })

  it('ignores the retired sort parameters a bookmarked URL may still carry', () => {
    const bookmarked = Object.fromEntries(new URLSearchParams('sort=hostname&dir=asc'))
    expect(parseLegacyDevicePageParams(bookmarked)).toEqual(parseLegacyDevicePageParams({}))
  })
})

describe('buildLegacyDevicePageUrl', () => {
  it('omits defaults and preserves active filters', () => {
    const base = parseLegacyDevicePageParams({})
    expect(buildLegacyDevicePageUrl(base)).toBe('/legacy/devices')
    expect(
      buildLegacyDevicePageUrl({
        ...base,
        query: 'edge',
        sites: ['hq', 'dc1'],
        deviceTypes: ['switch'],
        page: 2,
        pageSize: 100,
      }),
    ).toBe('/legacy/devices?query=edge&site=hq%2Cdc1&deviceType=switch&page=2&pageSize=100')
  })

  it('round-trips through the parser', () => {
    const params = parseLegacyDevicePageParams({
      query: 'core',
      site: 'dc1,hq',
      deviceType: 'router',
      page: '3',
    })
    const parsed = parseLegacyDevicePageParams(
      Object.fromEntries(new URL(buildLegacyDevicePageUrl(params), 'http://x').searchParams),
    )
    expect(parsed).toEqual(params)
  })
})
