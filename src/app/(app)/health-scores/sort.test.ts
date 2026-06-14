import { describe, expect, it } from 'bun:test'
import { sortHealthRows } from './sort'

describe('sortHealthRows', () => {
  it('orders worst (lowest) score first', () => {
    const rows = [
      { score: 99, name: 'a' },
      { score: 70, name: 'b' },
      { score: 88, name: 'c' },
    ]
    expect(sortHealthRows(rows).map(r => r.score)).toEqual([70, 88, 99])
  })

  it('breaks ties by name using natural order', () => {
    const rows = [
      { score: 90, name: 'node-10' },
      { score: 90, name: 'node-2' },
    ]
    expect(sortHealthRows(rows).map(r => r.name)).toEqual(['node-2', 'node-10'])
  })
})
