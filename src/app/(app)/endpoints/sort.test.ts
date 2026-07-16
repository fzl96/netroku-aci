import { describe, expect, it } from 'bun:test'
import type { Endpoint } from '@prisma/client'
import { groupEndpointsByPort, nextSortState, sortEndpointRows, sortPortRows } from './sort'

function endpoint(overrides: Partial<Endpoint> = {}): Endpoint {
  return {
    id: 'endpoint-1',
    apicHostId: 'host-1',
    dn: 'uni/tn-test/ap-test/epg-test/cep-00:11:22:33:44:55',
    mac: '00:11:22:33:44:55',
    ip: '10.0.0.1',
    vlan: '100',
    node: '101',
    interface: 'eth1/1',
    epgDescr: 'Web',
    isActive: true,
    firstSeenAt: new Date('2026-01-01'),
    lastSeenAt: new Date('2026-01-01'),
    clearedAt: null,
    ...overrides,
  }
}

describe('groupEndpointsByPort', () => {
  it('groups endpoints into unique ports and naturally sorts by node then interface', () => {
    const endpoints = [
      { id: '1', node: '3101', interface: 'eth1/10', mac: '00:11:22:33:44:55', ip: '10.0.0.1', vlan: '100', epgDescr: 'Web', isActive: true, firstSeenAt: new Date(), lastSeenAt: new Date('2026-01-02'), apicHostId: 'h1', dn: 'dn1', clearedAt: null },
      { id: '2', node: '3101', interface: 'eth1/10', mac: '00:11:22:33:44:56', ip: '10.0.0.2', vlan: '101', epgDescr: 'App', isActive: false, firstSeenAt: new Date(), lastSeenAt: new Date('2026-01-05'), apicHostId: 'h1', dn: 'dn2', clearedAt: null },
      { id: '3', node: '3101-3102', interface: 'eth1/1', mac: '00:11:22:33:44:57', ip: '10.0.0.3', vlan: '100', epgDescr: 'Web', isActive: true, firstSeenAt: new Date(), lastSeenAt: new Date('2026-01-01'), apicHostId: 'h1', dn: 'dn3', clearedAt: null },
      { id: '4', node: '99', interface: 'eth1/1', mac: '00:11:22:33:44:58', ip: '10.0.0.4', vlan: '200', epgDescr: 'DB', isActive: true, firstSeenAt: new Date(), lastSeenAt: new Date('2026-01-01'), apicHostId: 'h1', dn: 'dn4', clearedAt: null },
    ]

    const result = groupEndpointsByPort(endpoints)

    expect(result.length).toBe(3)
    expect(result.map(p => `${p.node} ${p.interface}`)).toEqual([
      '99 eth1/1',
      '3101 eth1/10',
      '3101-3102 eth1/1',
    ])

    const port3101Eth10 = result.find(p => p.node === '3101' && p.interface === 'eth1/10')!
    expect(port3101Eth10.endpointCount).toBe(2)
    expect(port3101Eth10.activeCount).toBe(1)
    expect(port3101Eth10.historicalCount).toBe(1)
    expect(port3101Eth10.vlans).toEqual(['100', '101'])
    expect(port3101Eth10.epgDescrs).toEqual(['Web', 'App'])
  })
})

describe('sortEndpointRows', () => {
  it('sorts dates and status without mutating the input', () => {
    const rows = [
      endpoint({ id: 'historical', lastSeenAt: new Date('2026-01-02'), isActive: false }),
      endpoint({ id: 'active', lastSeenAt: new Date('2026-01-01'), isActive: true }),
      endpoint({ id: 'missing', lastSeenAt: null, isActive: false }),
    ]

    expect(sortEndpointRows(rows, 'lastSeenAt', 'asc').map(row => row.id)).toEqual(['active', 'historical', 'missing'])
    expect(sortEndpointRows(rows, 'status', 'asc').map(row => row.id)).toEqual(['active', 'historical', 'missing'])
    expect(rows.map(row => row.id)).toEqual(['historical', 'active', 'missing'])
  })
})

describe('sortPortRows', () => {
  it('sorts counts numerically and interfaces naturally', () => {
    const rows = groupEndpointsByPort([
      endpoint({ id: 'eth10-a', interface: 'eth1/10' }),
      endpoint({ id: 'eth10-b', interface: 'eth1/10' }),
      endpoint({ id: 'eth2-a', interface: 'eth1/2' }),
      endpoint({ id: 'eth2-b', interface: 'eth1/2' }),
      endpoint({ id: 'eth2-c', interface: 'eth1/2' }),
    ])

    expect(sortPortRows(rows, 'interface', 'asc').map(row => row.interface)).toEqual(['eth1/2', 'eth1/10'])
    expect(sortPortRows(rows, 'endpointCount', 'desc').map(row => row.interface)).toEqual(['eth1/2', 'eth1/10'])
  })
})

describe('nextSortState', () => {
  it('starts new columns ascending and toggles the active column direction', () => {
    expect(nextSortState(undefined, undefined, 'mac')).toEqual({ key: 'mac', direction: 'asc' })
    expect(nextSortState('mac', 'asc', 'mac')).toEqual({ key: 'mac', direction: 'desc' })
    expect(nextSortState('mac', 'desc', 'node')).toEqual({ key: 'node', direction: 'asc' })
  })
})
