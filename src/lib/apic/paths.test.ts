import { describe, it, expect } from 'bun:test'
import { buildPathSegment, buildMoPath } from './paths'
import type { ParsedRow } from './types'

const base: Omit<ParsedRow, 'port_type' | 'node2' | 'interface_or_ipg'> = {
  rowIndex: 1,
  tenant: 'TenantA',
  ap: 'App1',
  epg: 'Web-EPG',
  vlan: 100,
  node1: 101,
  mode: 'regular',
  immediacy: 'immediate',
}

describe('buildPathSegment', () => {
  it('builds vpc path with both nodes', () => {
    const row: ParsedRow = { ...base, port_type: 'vpc', node2: 102, interface_or_ipg: 'myVPC_IPG' }
    expect(buildPathSegment(row)).toBe('topology/pod-1/protpaths-101-102/pathep-[myVPC_IPG]')
  })

  it('builds pc path with single node', () => {
    const row: ParsedRow = { ...base, port_type: 'pc', node2: null, interface_or_ipg: 'myPC_IPG' }
    expect(buildPathSegment(row)).toBe('topology/pod-1/paths-101/pathep-[myPC_IPG]')
  })

  it('builds port path with interface name', () => {
    const row: ParsedRow = { ...base, port_type: 'port', node2: null, interface_or_ipg: 'eth1/1' }
    expect(buildPathSegment(row)).toBe('topology/pod-1/paths-101/pathep-[eth1/1]')
  })
})

describe('buildMoPath', () => {
  it('builds full MO path for vpc', () => {
    const row: ParsedRow = { ...base, port_type: 'vpc', node2: 102, interface_or_ipg: 'myVPC_IPG' }
    expect(buildMoPath(row)).toBe(
      '/api/node/mo/uni/tn-TenantA/ap-App1/epg-Web-EPG/rspathAtt-[topology/pod-1/protpaths-101-102/pathep-[myVPC_IPG]].json'
    )
  })

  it('builds full MO path for port', () => {
    const row: ParsedRow = { ...base, port_type: 'port', node2: null, interface_or_ipg: 'eth1/1' }
    expect(buildMoPath(row)).toBe(
      '/api/node/mo/uni/tn-TenantA/ap-App1/epg-Web-EPG/rspathAtt-[topology/pod-1/paths-101/pathep-[eth1/1]].json'
    )
  })
})
