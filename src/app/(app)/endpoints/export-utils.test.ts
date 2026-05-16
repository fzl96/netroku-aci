import { describe, expect, it } from 'bun:test'
import {
  buildEndpointExportPayload,
  getDefaultExportScope,
} from './export-utils'

describe('getDefaultExportScope', () => {
  it('prefers filtered exports when filters are active and have results', () => {
    expect(getDefaultExportScope(true, 3)).toBe('filtered')
  })

  it('falls back to all endpoints when no filtered rows are available', () => {
    expect(getDefaultExportScope(true, 0)).toBe('all')
    expect(getDefaultExportScope(false, 3)).toBe('all')
  })
})

describe('buildEndpointExportPayload', () => {
  it('omits filters for full exports', () => {
    expect(buildEndpointExportPayload({
      apicHostId: 'host-1',
      scope: 'all',
      groupBy: 'node',
      filters: {
        query: 'aa',
        vlan: ['vlan-100'],
        node: ['101'],
        iface: ['eth1/1'],
        status: ['active'],
      },
    })).toEqual({
      apicHostId: 'host-1',
      scope: 'all',
      groupBy: 'node',
    })
  })

  it('includes active filters for filtered exports', () => {
    expect(buildEndpointExportPayload({
      apicHostId: 'host-1',
      scope: 'filtered',
      groupBy: 'vlan',
      filters: {
        query: 'aa',
        vlan: ['vlan-100'],
        node: ['101'],
        iface: ['eth1/1'],
        status: ['historical'],
      },
    })).toEqual({
      apicHostId: 'host-1',
      scope: 'filtered',
      groupBy: 'vlan',
      filters: {
        query: 'aa',
        vlan: ['vlan-100'],
        node: ['101'],
        iface: ['eth1/1'],
        status: ['historical'],
      },
    })
  })
})
