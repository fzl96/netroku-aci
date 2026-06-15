import { describe, expect, it } from 'bun:test'
import { sortComponentRows, sortNodeRows } from './sort'

describe('sortNodeRows', () => {
  it('orders by node id in natural numeric order', () => {
    const rows = [{ nodeId: '102' }, { nodeId: '11' }, { nodeId: '2' }]
    expect(sortNodeRows(rows).map(r => r.nodeId)).toEqual(['2', '11', '102'])
  })
})

describe('sortComponentRows', () => {
  it('puts failed components first, then orders by node id', () => {
    const rows = [
      { healthy: true, nodeId: '101', name: '1' },
      { healthy: false, nodeId: '103', name: '1' },
      { healthy: false, nodeId: '101', name: '2' },
    ]
    expect(sortComponentRows(rows).map(r => `${r.nodeId}/${r.healthy}`)).toEqual([
      '101/false',
      '103/false',
      '101/true',
    ])
  })
})
