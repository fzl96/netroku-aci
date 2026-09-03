import { describe, expect, it, mock } from 'bun:test'

mock.module('server-only', () => ({}))

const { buildEndpointWhere } = await import('./query')

describe('buildEndpointWhere', () => {
  it('scopes unfiltered queries to the selected APIC host', () => {
    expect(buildEndpointWhere('host-1', {})).toEqual({ apicHostId: 'host-1' })
  })

  it('adds list filters and a single active status filter', () => {
    expect(
      buildEndpointWhere('host-1', {
        vlan: ['vlan-100'],
        node: ['101'],
        iface: ['eth1/1'],
        status: ['active'],
      }),
    ).toEqual({
      apicHostId: 'host-1',
      vlan: { in: ['vlan-100'] },
      AND: [
        {
          OR: [{ node: '101' }, { node: { startsWith: '101-' } }, { node: { endsWith: '-101' } }],
        },
      ],
      interface: { in: ['eth1/1'] },
      isActive: true,
    })
  })

  it('does not constrain status when both values are selected', () => {
    expect(
      buildEndpointWhere('host-1', {
        status: ['active', 'historical'],
      }),
    ).toEqual({ apicHostId: 'host-1' })
  })

  it('adds search across every endpoint field currently supported by the page', () => {
    expect(buildEndpointWhere('host-1', { query: 'needle' })).toEqual({
      apicHostId: 'host-1',
      OR: [
        { mac: { contains: 'needle', mode: 'insensitive' } },
        { ip: { contains: 'needle', mode: 'insensitive' } },
        { vlan: { contains: 'needle', mode: 'insensitive' } },
        { node: { contains: 'needle', mode: 'insensitive' } },
        { interface: { contains: 'needle', mode: 'insensitive' } },
        { epgDescr: { contains: 'needle', mode: 'insensitive' } },
        { dn: { contains: 'needle', mode: 'insensitive' } },
      ],
    })
  })
})
