import { describe, expect, it } from 'bun:test'
import { sortBindingRows } from './sort'

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
