import { describe, expect, it } from 'bun:test'
import { buildLegacyEndpointPageUrl, parseLegacyEndpointPageParams } from './params'

describe('parseLegacyEndpointPageParams', () => {
  it('applies defaults when nothing is supplied', () => {
    expect(parseLegacyEndpointPageParams({})).toEqual({
      query: '',
      sites: [],
      devices: [],
      vlans: [],
      interfaces: [],
      statuses: ['active'],
      page: 1,
      pageSize: 50,
    })
  })

  it('collects every selected value of a filter group', () => {
    const params = parseLegacyEndpointPageParams({ vlan: ['  100  ', '20,100'] })
    expect(params.vlans).toEqual(['20', '100'])
  })

  it('reads the lifecycle group and treats all as no narrowing', () => {
    expect(parseLegacyEndpointPageParams({ status: 'historical' }).statuses).toEqual(['historical'])
    expect(parseLegacyEndpointPageParams({ status: 'historical,active' }).statuses).toEqual([
      'active',
      'historical',
    ])
    expect(parseLegacyEndpointPageParams({ status: 'all' }).statuses).toEqual([])
    expect(parseLegacyEndpointPageParams({ status: 'nonsense' }).statuses).toEqual([])
  })

  it('rejects invalid pages and page sizes', () => {
    expect(parseLegacyEndpointPageParams({ page: '0' }).page).toBe(1)
    expect(parseLegacyEndpointPageParams({ pageSize: '17' }).pageSize).toBe(50)
    expect(parseLegacyEndpointPageParams({ pageSize: '1000' }).pageSize).toBe(1000)
  })

  it('ignores the retired sort parameters a bookmarked URL may still carry', () => {
    const bookmarked = Object.fromEntries(new URLSearchParams('sort=mac&dir=asc'))
    expect(parseLegacyEndpointPageParams(bookmarked)).toEqual(parseLegacyEndpointPageParams({}))
  })
})

describe('buildLegacyEndpointPageUrl', () => {
  it('omits defaults and preserves active filters', () => {
    const base = parseLegacyEndpointPageParams({})
    expect(buildLegacyEndpointPageUrl(base)).toBe('/legacy/endpoints')
    expect(
      buildLegacyEndpointPageUrl({
        ...base,
        query: 'aa:bb',
        sites: ['hq'],
        devices: ['d1'],
        vlans: ['100'],
        interfaces: ['Gi1/0/1'],
        statuses: ['historical'],
        page: 2,
      }),
    ).toBe(
      '/legacy/endpoints?query=aa%3Abb&site=hq&device=d1&vlan=100&interface=Gi1%2F0%2F1&status=historical&page=2',
    )
  })

  it('spells an empty lifecycle group as all so it survives a round trip', () => {
    const base = parseLegacyEndpointPageParams({})
    expect(buildLegacyEndpointPageUrl({ ...base, statuses: [] })).toBe(
      '/legacy/endpoints?status=all',
    )
    expect(buildLegacyEndpointPageUrl({ ...base, statuses: ['active', 'historical'] })).toBe(
      '/legacy/endpoints?status=active%2Chistorical',
    )
  })

  it('round-trips through the parser', () => {
    for (const input of [
      { query: 'core', vlan: '100,20', page: '3' },
      { status: 'all' },
      { status: 'active,historical' },
      { site: 'hq,dc1', device: 'd2,d1', interface: 'Gi1/0/1' },
    ]) {
      const params = parseLegacyEndpointPageParams(input)
      expect(
        parseLegacyEndpointPageParams(
          Object.fromEntries(new URL(buildLegacyEndpointPageUrl(params), 'http://x').searchParams),
        ),
      ).toEqual(params)
    }
  })
})
