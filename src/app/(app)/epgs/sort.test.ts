import { describe, expect, it } from 'bun:test'
import { sortBindingRows, groupBindingsByPort } from './sort'
import type { BindingWithEpg } from '@/lib/epgs/query'

describe('sortBindingRows', () => {
  it('natural sorts by node then port', () => {
    const rows = [
      { node: '101', port: 'eth1/10' },
      { node: '101', port: 'eth1/2' },
      { node: '99', port: 'eth1/1' },
      { node: '101-102', port: 'VPC_IPG' },
    ]
    expect(sortBindingRows(rows).map(r => `${r.node} ${r.port}`)).toEqual([
      '99 eth1/1',
      '101 eth1/2',
      '101 eth1/10',
      '101-102 VPC_IPG',
    ])
  })
})

describe('groupBindingsByPort', () => {
  it('groups bindings into unique ports and naturally sorts by node then port', () => {
    const bindings: BindingWithEpg[] = [
      { id: 'b1', apicHostId: 'h1', epgId: 'e1', dn: 'dn1', pathTDn: 'p1', pod: 'pod-1', node: '101', port: 'eth1/10', pathType: 'port', encap: 'vlan-100', mode: 'trunk', epg: { name: 'EPG1', tenant: 'T1', appProfile: 'AP1', dn: 'epg1' } },
      { id: 'b2', apicHostId: 'h1', epgId: 'e2', dn: 'dn2', pathTDn: 'p2', pod: 'pod-1', node: '101', port: 'eth1/10', pathType: 'port', encap: 'vlan-101', mode: 'trunk', epg: { name: 'EPG2', tenant: 'T1', appProfile: 'AP1', dn: 'epg2' } },
      { id: 'b3', apicHostId: 'h1', epgId: 'e3', dn: 'dn3', pathTDn: 'p3', pod: 'pod-1', node: '99', port: 'eth1/1', pathType: 'port', encap: 'vlan-200', mode: 'access', epg: { name: 'EPG3', tenant: 'T2', appProfile: 'AP2', dn: 'epg3' } },
    ]

    const result = groupBindingsByPort(bindings)
    expect(result.length).toBe(2)
    expect(result.map(p => `${p.node} ${p.port}`)).toEqual([
      '99 eth1/1',
      '101 eth1/10',
    ])

    const port101Eth10 = result.find(p => p.node === '101' && p.port === 'eth1/10')!
    expect(port101Eth10.epgCount).toBe(2)
    expect(port101Eth10.tenants).toEqual(['T1'])
    expect(port101Eth10.encaps).toEqual(['vlan-100', 'vlan-101'])
  })
})
