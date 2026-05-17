import { describe, expect, it } from 'bun:test'
import { sortInterfaceRows } from './sort'

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
})
