import { describe, expect, it } from 'bun:test'
import {
  buildEndpointPageUrl,
  countActiveEndpointFilterGroups,
  hasActiveEndpointFilters,
  parseEndpointPageParams,
  type EndpointFilters,
  type EndpointPageParams,
} from './params'

describe('parseEndpointPageParams', () => {
  it('returns explicit defaults for an empty query', () => {
    expect(parseEndpointPageParams({})).toEqual({
      hostId: '',
      view: 'endpoint',
      query: '',
      page: 1,
      pageSize: 50,
      vlans: [],
      nodes: [],
      interfaces: [],
      statuses: [],
    })
  })

  it('accepts both views and every supported page size', () => {
    expect(parseEndpointPageParams({ view: 'port', pageSize: 'all' })).toMatchObject({
      view: 'port',
      pageSize: 'all',
    })
    for (const pageSize of [10, 50, 100, 1000] as const) {
      expect(parseEndpointPageParams({
        view: 'endpoint',
        pageSize: String(pageSize),
      }).pageSize).toBe(pageSize)
    }
  })

  it('uses the first repeated scalar and flattens repeated comma-list values', () => {
    expect(parseEndpointPageParams({
      apic: [' host-1 ', 'host-2'],
      view: ['port', 'endpoint'],
      query: [' needle ', 'ignored'],
      page: ['3', '7'],
      pageSize: ['100', '10'],
      vlan: [' vlan-20, vlan-2 ', 'vlan-10,vlan-2'],
      node: ['102,101', '102'],
      iface: ['eth1/10, eth1/2', 'eth1/2'],
      status: ['invalid,active', 'active'],
    })).toEqual({
      hostId: 'host-1',
      view: 'port',
      query: 'needle',
      page: 3,
      pageSize: 100,
      vlans: ['vlan-2', 'vlan-10', 'vlan-20'],
      nodes: ['101', '102'],
      interfaces: [],
      statuses: ['active'],
    })
  })

  it('rejects partial, unsafe, decimal, non-positive, and unsupported numeric values', () => {
    for (const page of ['2junk', '1.5', '0', '-1', '9007199254740992', 'NaN']) {
      expect(parseEndpointPageParams({ page }).page).toBe(1)
    }
    for (const pageSize of ['10junk', '25', '0', '-10', '1.5']) {
      expect(parseEndpointPageParams({ pageSize }).pageSize).toBe(50)
    }
  })

  it('normalizes invalid values and treats both statuses as no status filter', () => {
    expect(parseEndpointPageParams({
      view: 'PORT',
      vlan: ' , vlan-2, vlan-2, ',
      status: 'historical,invalid,active,historical',
    })).toMatchObject({
      view: 'endpoint',
      vlans: ['vlan-2'],
      statuses: [],
    })
  })
})

describe('buildEndpointPageUrl', () => {
  it('omits defaults and no-op filters in a stable key order', () => {
    const params: EndpointPageParams = {
      hostId: 'host 1',
      view: 'port',
      query: 'aa bb',
      page: 2,
      pageSize: 100,
      vlans: ['vlan-2', 'vlan-20'],
      nodes: ['101', '102'],
      interfaces: ['eth1/1'],
      statuses: ['active'],
    }

    expect(buildEndpointPageUrl(params)).toBe(
      '/endpoints?apic=host+1&view=port&query=aa+bb&page=2&pageSize=100&vlan=vlan-2%2Cvlan-20&node=101%2C102&status=active',
    )
    expect(params.interfaces).toEqual(['eth1/1'])
  })

  it('returns the route alone when every value is a default', () => {
    expect(buildEndpointPageUrl(parseEndpointPageParams({}))).toBe('/endpoints')
  })

  it('round-trips canonical normalized parameters', () => {
    const parsed = parseEndpointPageParams({
      apic: ' host-1 ',
      query: ' mac ',
      page: '4',
      pageSize: '10',
      iface: 'eth1/10,eth1/2',
      status: 'historical',
    })
    const url = new URL(buildEndpointPageUrl(parsed), 'http://localhost')

    expect(parseEndpointPageParams(Object.fromEntries(url.searchParams.entries())))
      .toEqual(parsed)
  })
})

describe('endpoint filter state', () => {
  it('detects active filters without counting blank values', () => {
    expect(hasActiveEndpointFilters({ query: '   ', vlan: [], node: [] })).toBe(false)
    expect(hasActiveEndpointFilters({ query: 'mac' })).toBe(true)
    expect(hasActiveEndpointFilters({ vlan: ['vlan-100'] })).toBe(true)
    expect(hasActiveEndpointFilters({ status: ['historical'] })).toBe(true)
  })

  it('counts populated filter groups and excludes interfaces from port view', () => {
    const filters: EndpointFilters = {
      vlan: ['vlan-100', 'vlan-200'],
      node: ['101'],
      iface: ['eth1/1'],
      status: ['active'],
    }
    expect(countActiveEndpointFilterGroups(filters, 'endpoint')).toBe(4)
    expect(countActiveEndpointFilterGroups(filters, 'port')).toBe(3)
  })
})
