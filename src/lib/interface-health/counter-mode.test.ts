import { describe, expect, it } from 'bun:test'
import { selectVisibleCounters, type CounterFields } from './counter-mode'

const row: CounterFields = {
  rxBytes: '1000',
  rxErrors: '11',
  rxCrcErrors: '12',
  rxAlignErrors: '13',
  txBytes: '2000',
  txErrors: '21',
  dRxBytes: '100',
  dRxErrors: '1',
  dRxCrcErrors: '2',
  dRxAlignErrors: '3',
  dTxBytes: '200',
  dTxErrors: '4',
}

describe('selectVisibleCounters', () => {
  it('returns the derived counters in delta mode', () => {
    expect(selectVisibleCounters(row, 'delta')).toEqual({
      rxBytes: '100',
      rxErrors: '1',
      rxCrcErrors: '2',
      rxAlignErrors: '3',
      txBytes: '200',
      txErrors: '4',
    })
  })

  it('returns the latest raw counters in current mode', () => {
    expect(selectVisibleCounters(row, 'current')).toEqual({
      rxBytes: '1000',
      rxErrors: '11',
      rxCrcErrors: '12',
      rxAlignErrors: '13',
      txBytes: '2000',
      txErrors: '21',
    })
  })
})
