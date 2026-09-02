import { describe, expect, it } from 'bun:test'
import { sumCrcByInterface, sortByCrcWindowTotal } from './crc-window'

describe('sumCrcByInterface', () => {
  it('sums positive dRxCrcErrors per interface', () => {
    const totals = sumCrcByInterface([
      { interfaceId: 'a', dRxCrcErrors: BigInt(5) },
      { interfaceId: 'a', dRxCrcErrors: BigInt(3) },
      { interfaceId: 'b', dRxCrcErrors: BigInt(12) },
    ])
    expect(totals.get('a')).toBe(BigInt(8))
    expect(totals.get('b')).toBe(BigInt(12))
  })

  it('skips null and non-positive deltas (reset contributes 0)', () => {
    const totals = sumCrcByInterface([
      { interfaceId: 'a', dRxCrcErrors: BigInt(4) },
      { interfaceId: 'a', dRxCrcErrors: null },
      { interfaceId: 'a', dRxCrcErrors: BigInt(-9) },
      { interfaceId: 'a', dRxCrcErrors: BigInt(0) },
    ])
    expect(totals.get('a')).toBe(BigInt(4))
  })

  it('omits interfaces with no positive samples', () => {
    const totals = sumCrcByInterface([
      { interfaceId: 'a', dRxCrcErrors: null },
    ])
    expect(totals.has('a')).toBe(false)
  })

  it('handles empty input', () => {
    expect(sumCrcByInterface([]).size).toBe(0)
  })
})

describe('sortByCrcWindowTotal', () => {
  const rows = [
    { id: 'a', node: '1805', ifName: 'eth1/3' },
    { id: 'b', node: '1806', ifName: 'eth1/26' },
    { id: 'c', node: '1806', ifName: 'eth1/27' },
  ]
  const totals = new Map<string, bigint>([
    ['a', BigInt(10)],
    ['c', BigInt(500)],
  ])

  it('sorts by windowed total descending by default, worst first', () => {
    const sorted = sortByCrcWindowTotal(rows, totals)
    expect(sorted.map(r => r.id)).toEqual(['c', 'a', 'b'])
  })

  it('sorts ascending when asked', () => {
    const sorted = sortByCrcWindowTotal(rows, totals, 'asc')
    expect(sorted.map(r => r.id)).toEqual(['b', 'a', 'c'])
  })

  it('breaks ties by natural node/ifName order', () => {
    const tied = [
      { id: 'x', node: '1806', ifName: 'eth1/27' },
      { id: 'y', node: '1806', ifName: 'eth1/3' },
    ]
    const sorted = sortByCrcWindowTotal(tied, new Map())
    expect(sorted.map(r => r.id)).toEqual(['y', 'x'])
  })

  it('does not mutate the input array', () => {
    const input = [...rows]
    sortByCrcWindowTotal(input, totals)
    expect(input.map(r => r.id)).toEqual(['a', 'b', 'c'])
  })
})
