import { describe, expect, it } from 'bun:test'
import { sortFaultRows } from './sort'

describe('sortFaultRows', () => {
  it('orders by severity critical > major > minor > warning', () => {
    const rows = [
      { severity: 'minor', code: 'F3' },
      { severity: 'critical', code: 'F1' },
      { severity: 'warning', code: 'F4' },
      { severity: 'major', code: 'F2' },
    ]
    expect(sortFaultRows(rows).map(r => r.code)).toEqual(['F1', 'F2', 'F3', 'F4'])
  })

  it('breaks ties by code using natural order', () => {
    const rows = [
      { severity: 'major', code: 'F10' },
      { severity: 'major', code: 'F2' },
    ]
    expect(sortFaultRows(rows).map(r => r.code)).toEqual(['F2', 'F10'])
  })

  it('sorts unknown severities last', () => {
    const rows = [
      { severity: 'weird', code: 'F9' },
      { severity: 'minor', code: 'F1' },
    ]
    expect(sortFaultRows(rows).map(r => r.code)).toEqual(['F1', 'F9'])
  })
})
