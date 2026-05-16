import { describe, expect, it } from 'bun:test'
import { buildEndpointWhere, hasActiveEndpointFilters } from './query'

describe('buildEndpointWhere', () => {
  it('scopes unfiltered queries to the selected APIC host', () => {
    expect(buildEndpointWhere('host-1', {})).toEqual({ apicHostId: 'host-1' })
  })

  it('adds list filters and a single active status filter', () => {
    expect(buildEndpointWhere('host-1', {
      vlan: ['vlan-100'],
      node: ['101'],
      iface: ['eth1/1'],
      status: ['active'],
    })).toEqual({
      apicHostId: 'host-1',
      vlan: { in: ['vlan-100'] },
      node: { in: ['101'] },
      interface: { in: ['eth1/1'] },
      isActive: true,
    })
  })

  it('does not constrain status when both values are selected', () => {
    expect(buildEndpointWhere('host-1', {
      status: ['active', 'historical'],
    })).toEqual({ apicHostId: 'host-1' })
  })

  it('adds search across every endpoint field currently supported by the page', () => {
    expect(buildEndpointWhere('host-1', { query: 'needle' })).toEqual({
      apicHostId: 'host-1',
      OR: [
        { mac: { contains: 'needle' } },
        { ip: { contains: 'needle' } },
        { vlan: { contains: 'needle' } },
        { node: { contains: 'needle' } },
        { interface: { contains: 'needle' } },
        { epgDescr: { contains: 'needle' } },
        { dn: { contains: 'needle' } },
      ],
    })
  })
})

describe('hasActiveEndpointFilters', () => {
  it('returns false when every filter is empty', () => {
    expect(hasActiveEndpointFilters({})).toBe(false)
    expect(hasActiveEndpointFilters({
      query: '   ',
      vlan: [],
      node: [],
      iface: [],
      status: [],
    })).toBe(false)
  })

  it('returns true when any exportable filter is active', () => {
    expect(hasActiveEndpointFilters({ query: 'mac' })).toBe(true)
    expect(hasActiveEndpointFilters({ vlan: ['vlan-100'] })).toBe(true)
    expect(hasActiveEndpointFilters({ node: ['101'] })).toBe(true)
    expect(hasActiveEndpointFilters({ iface: ['eth1/1'] })).toBe(true)
    expect(hasActiveEndpointFilters({ status: ['historical'] })).toBe(true)
  })
})
