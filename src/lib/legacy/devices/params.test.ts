import { describe, expect, it } from 'bun:test'
import { buildLegacyDevicePageUrl, parseLegacyDevicePageParams } from './params'

describe('parseLegacyDevicePageParams', () => {
  it('applies defaults when nothing is supplied', () => {
    expect(parseLegacyDevicePageParams({})).toEqual({
      query: '',
      site: '',
      deviceType: '',
      sort: 'lastSeenAt',
      direction: 'desc',
      page: 1,
      pageSize: 50,
    })
  })

  it('takes the first value of a repeated key and trims whitespace', () => {
    const params = parseLegacyDevicePageParams({
      query: ['  edge  ', 'ignored'],
      site: ['  hq  '],
    })
    expect(params.query).toBe('edge')
    expect(params.site).toBe('hq')
  })

  it('rejects invalid pages and page sizes', () => {
    expect(parseLegacyDevicePageParams({ page: '0' }).page).toBe(1)
    expect(parseLegacyDevicePageParams({ page: 'abc' }).page).toBe(1)
    expect(parseLegacyDevicePageParams({ page: '7' }).page).toBe(7)
    expect(parseLegacyDevicePageParams({ pageSize: '17' }).pageSize).toBe(50)
    expect(parseLegacyDevicePageParams({ pageSize: '100' }).pageSize).toBe(100)
  })

  it('falls back to the default sort for unknown columns', () => {
    expect(parseLegacyDevicePageParams({ sort: 'hostname' }).sort).toBe('hostname')
    expect(parseLegacyDevicePageParams({ sort: 'nonsense' }).sort).toBe('lastSeenAt')
    expect(parseLegacyDevicePageParams({ dir: 'asc' }).direction).toBe('asc')
    expect(parseLegacyDevicePageParams({ dir: 'sideways' }).direction).toBe('desc')
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
        site: 'hq',
        deviceType: 'switch',
        sort: 'hostname',
        direction: 'asc',
        page: 2,
        pageSize: 100,
      }),
    ).toBe(
      '/legacy/devices?query=edge&site=hq&deviceType=switch&sort=hostname&dir=asc&page=2&pageSize=100',
    )
  })

  it('round-trips through the parser', () => {
    const params = parseLegacyDevicePageParams({
      query: 'core',
      site: 'dc1',
      sort: 'model',
      dir: 'asc',
      page: '3',
    })
    const parsed = parseLegacyDevicePageParams(
      Object.fromEntries(new URL(buildLegacyDevicePageUrl(params), 'http://x').searchParams),
    )
    expect(parsed).toEqual(params)
  })
})
