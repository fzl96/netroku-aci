import { describe, expect, it } from 'bun:test'
import { bdExportSchema, buildBdPageUrl, parseBdPageParams } from './params'
describe('BD inventory parameters', () => {
  it('builds exact BD destinations by host and DN, independent of table pagination', () => {
    const params = parseBdPageParams({
      apic: 'fabric-2',
      selected: 'uni/tn-common/BD-shared',
      page: '99',
    })
    expect(params.page).toBe(1)
    const url = new URL(buildBdPageUrl(params), 'http://localhost')
    expect(url.pathname).toBe('/bds')
    expect(url.searchParams.get('apic')).toBe('fabric-2')
    expect(url.searchParams.get('selected')).toBe('uni/tn-common/BD-shared')
    expect(parseBdPageParams(Object.fromEntries(url.searchParams))).toEqual(params)
    expect(
      bdExportSchema.parse({
        apicHostId: params.hostId,
        scope: 'filtered',
        filters: { selected: params.selected },
      }).filters?.selected,
    ).toBe(params.selected)
  })
  it('round trips host, search, filters and pagination', () => {
    const params = parseBdPageParams({
      apic: 'h1',
      query: 'gateway',
      tenant: ['T1,T2', 'T1'],
      vrf: 'VRF',
      routing: 'no',
      page: '2',
      pageSize: '100',
    })
    expect(params.tenant).toEqual(['T1', 'T2'])
    const url = new URL(buildBdPageUrl(params), 'http://localhost')
    expect(parseBdPageParams(Object.fromEntries(url.searchParams))).toEqual(params)
    expect(parseBdPageParams({ page: '-1', pageSize: '123', routing: 'invalid' })).toMatchObject({
      page: 1,
      pageSize: 50,
    })
  })
  it('validates untrusted export requests', () => {
    expect(bdExportSchema.safeParse(null).success).toBe(false)
    expect(
      bdExportSchema.safeParse({
        apicHostId: 'h1',
        scope: 'filtered',
        filters: { routing: 'false' },
      }).success,
    ).toBe(false)
  })
})
