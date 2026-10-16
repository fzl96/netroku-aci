import { describe, expect, it } from 'bun:test'
import {
  buildDeviceListUrl,
  buildDeviceWhere,
  clampDevicePage,
  deviceListWindow,
  parseDeviceListParams,
} from './params'

describe('parseDeviceListParams', () => {
  it('trims the query and accepts a positive page', () => {
    expect(parseDeviceListParams({ q: '  sw01  ', page: '3' })).toEqual({
      query: 'sw01',
      sites: [],
      sources: [],
      page: 3,
    })
  })

  it('falls back to page 1 for missing or invalid page', () => {
    expect(parseDeviceListParams({})).toEqual({ query: '', sites: [], sources: [], page: 1 })
    expect(parseDeviceListParams({ page: '-2' })).toEqual({
      query: '',
      sites: [],
      sources: [],
      page: 1,
    })
  })

  it('reads comma-joined and repeated site ids as one deduped list', () => {
    expect(parseDeviceListParams({ site: ['s2,s1', 's1'] }).sites).toEqual(['s1', 's2'])
  })

  it('accepts only known sources and normalizes repeated selections', () => {
    expect(
      parseDeviceListParams({ source: ['LEGACY,ACI', 'ACI,UNLINKED,unknown'] }).sources,
    ).toEqual(['ACI', 'LEGACY', 'UNLINKED'])
    expect(parseDeviceListParams({ source: 'unknown' }).sources).toEqual([])
  })
})

describe('buildDeviceWhere', () => {
  it('returns an empty where clause for no query', () => {
    expect(buildDeviceWhere({ query: '', sites: [], sources: [], page: 1 })).toEqual({})
  })

  it('builds an OR clause across searchable fields for a query', () => {
    const where = buildDeviceWhere({ query: 'core', sites: [], sources: [], page: 1 })
    expect(where.OR).toBeDefined()
    expect(where.OR).toHaveLength(9)
    expect(where.OR).toContainEqual({
      managementIp: { contains: 'core', mode: 'insensitive' },
    })
    expect(where.OR).toContainEqual({
      deviceStack: { name: { contains: 'core', mode: 'insensitive' } },
    })
  })

  it('filters by the rack site and combines it with a query', () => {
    expect(buildDeviceWhere({ query: '', sites: ['s1'], sources: [], page: 1 })).toEqual({
      rack: { siteId: { in: ['s1'] } },
    })
    const where = buildDeviceWhere({ query: 'core', sites: ['s1', 's2'], sources: [], page: 1 })
    expect(where.AND).toHaveLength(2)
    expect(where.AND).toContainEqual({ rack: { siteId: { in: ['s1', 's2'] } } })
  })

  it('matches direct sources and falls back to stack sources only for unlinked members', () => {
    const where = buildDeviceWhere(parseDeviceListParams({ source: 'ACI,LEGACY' }))
    expect(where.OR).toEqual([
      { source: { is: { kind: { in: ['ACI', 'LEGACY'] } } } },
      {
        source: { is: null },
        deviceStack: { is: { source: { is: { kind: { in: ['ACI', 'LEGACY'] } } } } },
      },
    ])
  })

  it('requires both the device and its stack to lack sources for Unlinked', () => {
    const where = buildDeviceWhere(parseDeviceListParams({ source: 'UNLINKED' }))
    expect(where.OR).toEqual([
      {
        source: { is: null },
        OR: [{ deviceStack: { is: null } }, { deviceStack: { is: { source: { is: null } } } }],
      },
    ])
  })

  it('intersects search and site with the union of selected sources', () => {
    const params = parseDeviceListParams({ q: 'core', site: 's1', source: 'ACI,UNLINKED' })
    const where = buildDeviceWhere(params)
    expect(where.AND).toEqual([
      buildDeviceWhere({ ...params, query: '', sources: [] }),
      buildDeviceWhere({ ...params, query: '', sites: [] }),
      buildDeviceWhere({ ...params, sites: [], sources: [] }),
    ])
  })
})

describe('clampDevicePage / deviceListWindow', () => {
  it('clamps to the last page when requesting beyond the end', () => {
    expect(clampDevicePage(99, 25)).toBe(2) // 25 items / 20 per page = 2 pages
  })

  it('clamps to page 1 when there are no results', () => {
    expect(clampDevicePage(5, 0)).toBe(1)
  })

  it('computes skip/take for a mid-range page', () => {
    expect(deviceListWindow(2, 45)).toEqual({ page: 2, skip: 20, take: 20 })
  })
})

describe('buildDeviceListUrl', () => {
  it('omits defaults and preserves an active query while paging', () => {
    expect(buildDeviceListUrl({ query: '', sites: [], sources: [], page: 1 })).toBe(
      '/inventory/devices',
    )
    expect(buildDeviceListUrl({ query: '  sw01  ', sites: [], sources: [], page: 3 })).toBe(
      '/inventory/devices?q=sw01&page=3',
    )
  })

  it('keeps the site filter while paging', () => {
    expect(buildDeviceListUrl({ query: '', sites: ['s1', 's2'], sources: [], page: 2 })).toBe(
      '/inventory/devices?site=s1%2Cs2&page=2',
    )
  })

  it('round trips source filters alongside search, site and pagination', () => {
    const params = parseDeviceListParams({
      q: 'core',
      site: 's1',
      source: 'LEGACY,UNLINKED',
      page: '2',
    })
    const url = buildDeviceListUrl(params)
    expect(url).toBe('/inventory/devices?q=core&site=s1&source=LEGACY%2CUNLINKED&page=2')
    expect(
      parseDeviceListParams(Object.fromEntries(new URL(url, 'https://test').searchParams)),
    ).toEqual(params)
  })
})
