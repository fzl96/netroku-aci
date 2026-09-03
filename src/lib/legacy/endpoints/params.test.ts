import { describe, expect, it } from 'bun:test'
import {
  buildLegacyEndpointPageUrl,
  legacyEndpointStatuses,
  parseLegacyEndpointPageParams,
} from './params'

describe('parseLegacyEndpointPageParams', () => {
  it('applies defaults when nothing is supplied', () => {
    expect(parseLegacyEndpointPageParams({})).toEqual({
      query: '',
      site: '',
      device: '',
      vlan: '',
      interface: '',
      status: 'active',
      sort: 'lastSeen',
      direction: 'desc',
      page: 1,
      pageSize: 50,
    })
  })

  it('takes the first value of a repeated key and trims whitespace', () => {
    const params = parseLegacyEndpointPageParams({ vlan: ['  100  ', '200'] })
    expect(params.vlan).toBe('100')
  })

  it('normalizes the lifecycle filter', () => {
    expect(parseLegacyEndpointPageParams({ status: 'historical' }).status).toBe('historical')
    expect(parseLegacyEndpointPageParams({ status: 'all' }).status).toBe('all')
    expect(parseLegacyEndpointPageParams({ status: 'nonsense' }).status).toBe('active')
  })

  it('falls back to the default sort for unknown columns', () => {
    expect(parseLegacyEndpointPageParams({ sort: 'cleared' }).sort).toBe('cleared')
    expect(parseLegacyEndpointPageParams({ sort: 'nonsense' }).sort).toBe('lastSeen')
  })

  it('rejects invalid pages and page sizes', () => {
    expect(parseLegacyEndpointPageParams({ page: '0' }).page).toBe(1)
    expect(parseLegacyEndpointPageParams({ pageSize: '17' }).pageSize).toBe(50)
    expect(parseLegacyEndpointPageParams({ pageSize: '1000' }).pageSize).toBe(1000)
  })
})

describe('legacyEndpointStatuses', () => {
  it('expands the all filter to both lifecycle states', () => {
    expect(legacyEndpointStatuses('all')).toEqual(['active', 'historical'])
    expect(legacyEndpointStatuses('active')).toEqual(['active'])
    expect(legacyEndpointStatuses('historical')).toEqual(['historical'])
  })
})

describe('buildLegacyEndpointPageUrl', () => {
  it('omits defaults and preserves active filters', () => {
    const base = parseLegacyEndpointPageParams({})
    expect(buildLegacyEndpointPageUrl(base)).toBe('/legacy/endpoints')
    expect(buildLegacyEndpointPageUrl({
      ...base, query: 'aa:bb', site: 'hq', device: 'd1', vlan: '100',
      interface: 'Gi1/0/1', status: 'all', sort: 'mac', direction: 'asc', page: 2,
    })).toBe(
      '/legacy/endpoints?query=aa%3Abb&site=hq&device=d1&vlan=100'
      + '&interface=Gi1%2F0%2F1&status=all&sort=mac&dir=asc&page=2',
    )
  })

  it('round-trips through the parser', () => {
    const params = parseLegacyEndpointPageParams({
      query: 'core', vlan: '10', status: 'historical', sort: 'vlan', dir: 'asc', page: '4',
    })
    const parsed = parseLegacyEndpointPageParams(Object.fromEntries(
      new URL(buildLegacyEndpointPageUrl(params), 'http://x').searchParams,
    ))
    expect(parsed).toEqual(params)
  })
})
