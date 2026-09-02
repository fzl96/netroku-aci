import { describe, expect, it } from 'bun:test'
import { parseInterfaceSortParams, sortInterfaceRows } from './sort'

describe('sortInterfaceRows', () => {
  it('sorts nodes and interface names naturally', () => {
    const rows = [
      { node: '10', ifName: 'eth1/2' },
      { node: '2', ifName: 'eth1/10' },
      { node: '2', ifName: 'eth1/2' },
      { node: '2', ifName: 'eth1/1' },
    ]

    expect(sortInterfaceRows(rows)).toEqual([
      { node: '2', ifName: 'eth1/1' },
      { node: '2', ifName: 'eth1/2' },
      { node: '2', ifName: 'eth1/10' },
      { node: '10', ifName: 'eth1/2' },
    ])
  })

  it('sorts delta counters before pagination with nulls last', () => {
    const rows = [
      { node: '2', ifName: 'eth1/1', samples: [{ dRxErrors: null }] },
      { node: '2', ifName: 'eth1/2', samples: [{ dRxErrors: BigInt(15) }] },
      { node: '2', ifName: 'eth1/3', samples: [{ dRxErrors: BigInt(2) }] },
      { node: '2', ifName: 'eth1/4', samples: [] },
    ]

    expect(sortInterfaceRows(rows, {
      key: 'rxErrors',
      direction: 'desc',
      mode: 'delta',
    }).map(row => row.ifName)).toEqual([
      'eth1/2',
      'eth1/3',
      'eth1/1',
      'eth1/4',
    ])
  })

  it('sorts current counters when current mode is selected', () => {
    const rows = [
      { node: '2', ifName: 'eth1/1', samples: [{ rxErrors: BigInt(1), dRxErrors: BigInt(50) }] },
      { node: '2', ifName: 'eth1/2', samples: [{ rxErrors: BigInt(20), dRxErrors: BigInt(1) }] },
    ]

    expect(sortInterfaceRows(rows, {
      key: 'rxErrors',
      direction: 'desc',
      mode: 'current',
    }).map(row => row.ifName)).toEqual(['eth1/2', 'eth1/1'])
  })
})

describe('parseInterfaceSortParams', () => {
  it('accepts supported counter sort params', () => {
    expect(parseInterfaceSortParams({
      sort: 'rxErrors',
      dir: 'asc',
      mode: 'current',
    })).toEqual({
      key: 'rxErrors',
      direction: 'asc',
      mode: 'current',
    })
  })

  it('defaults sort direction and counter mode', () => {
    expect(parseInterfaceSortParams({
      sort: 'txBytes',
    })).toEqual({
      key: 'txBytes',
      direction: 'desc',
      mode: 'delta',
    })
  })

  it('ignores unsupported sort keys', () => {
    expect(parseInterfaceSortParams({
      sort: 'node',
      dir: 'asc',
      mode: 'current',
    })).toBeNull()
  })
})
