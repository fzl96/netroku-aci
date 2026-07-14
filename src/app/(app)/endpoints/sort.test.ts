import { describe, expect, it } from 'bun:test'
import { groupEndpointsByPort } from './sort'

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
