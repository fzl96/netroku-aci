import { describe, expect, test } from 'bun:test'
import { sortLegacyInterfaceRows, sumLegacyCrcByInterface } from './list-data'

interface TestRow {
  id: string
  hostname: string
  ifName: string
  description: string
  ipAddress: string | null
  adminSt: string
  operSt: string
  crcWindowTotal: string | null
  sample: {
    collectedAt: string
    inputErrors: string
    outputErrors: string
    crcErrors: string
    dInputErrors: string | null
    dOutputErrors: string | null
    dCrcErrors: string | null
  } | null
}

function row(overrides: Partial<TestRow> & Pick<TestRow, 'id' | 'ifName'>): TestRow {
  return {
    id: overrides.id,
    hostname: overrides.hostname ?? 'DC-CORE-01-L3',
    ifName: overrides.ifName,
    description: overrides.description ?? '',
    ipAddress: overrides.ipAddress ?? null,
    adminSt: overrides.adminSt ?? 'up',
    operSt: overrides.operSt ?? 'up',
    crcWindowTotal: overrides.crcWindowTotal ?? null,
    sample: overrides.sample ?? null,
  }
}

function sample(values: Partial<NonNullable<TestRow['sample']>> = {}): NonNullable<TestRow['sample']> {
  return {
    collectedAt: values.collectedAt ?? '2026-08-08T00:00:00.000Z',
    inputErrors: values.inputErrors ?? '0',
    outputErrors: values.outputErrors ?? '0',
    crcErrors: values.crcErrors ?? '0',
    dInputErrors: values.dInputErrors ?? '0',
    dOutputErrors: values.dOutputErrors ?? '0',
    dCrcErrors: values.dCrcErrors ?? '0',
  }
}

describe('legacy interface list data', () => {
  test('sorts hostname ties by natural interface order', () => {
    const rows = [
      row({ id: '10', ifName: 'Ethernet1/10' }),
      row({ id: '2', ifName: 'Ethernet1/2' }),
      row({ id: '1', ifName: 'Ethernet1/1' }),
    ]

    expect(sortLegacyInterfaceRows(rows, {
      key: 'hostname', direction: 'asc', mode: 'delta', view: 'all',
    }).map(item => item.ifName)).toEqual(['Ethernet1/1', 'Ethernet1/2', 'Ethernet1/10'])
    expect(rows.map(item => item.ifName)).toEqual(['Ethernet1/10', 'Ethernet1/2', 'Ethernet1/1'])
  })

  test('sorts the selected current or delta counter with nulls last', () => {
    const rows = [
      row({ id: 'raw-100', ifName: 'Ethernet1/1', sample: sample({ inputErrors: '100', dInputErrors: '1' }) }),
      row({ id: 'delta-10', ifName: 'Ethernet1/2', sample: sample({ inputErrors: '20', dInputErrors: '10' }) }),
      row({ id: 'missing', ifName: 'Ethernet1/3' }),
    ]

    expect(sortLegacyInterfaceRows(rows, {
      key: 'inputErrors', direction: 'desc', mode: 'delta', view: 'all',
    }).map(item => item.id)).toEqual(['delta-10', 'raw-100', 'missing'])
    expect(sortLegacyInterfaceRows(rows, {
      key: 'inputErrors', direction: 'desc', mode: 'current', view: 'all',
    }).map(item => item.id)).toEqual(['raw-100', 'delta-10', 'missing'])
    expect(sortLegacyInterfaceRows(rows, {
      key: 'inputErrors', direction: 'asc', mode: 'delta', view: 'all',
    }).map(item => item.id)).toEqual(['raw-100', 'delta-10', 'missing'])
  })

  test('sorts CRC view by exact window total', () => {
    const rows = [
      row({ id: 'small', ifName: 'Ethernet1/1', crcWindowTotal: '9', sample: sample({ dCrcErrors: '1000' }) }),
      row({ id: 'large', ifName: 'Ethernet1/2', crcWindowTotal: '9007199254740993', sample: sample({ dCrcErrors: '1' }) }),
    ]

    expect(sortLegacyInterfaceRows(rows, {
      key: 'crcErrors', direction: 'desc', mode: 'delta', view: 'crc',
    }).map(item => item.id)).toEqual(['large', 'small'])
  })

  test('uses stable natural identity tie-breakers for equal values', () => {
    const rows = [
      row({ id: 'b', hostname: 'edge-10', ifName: 'Ethernet1/1', description: 'same' }),
      row({ id: 'c', hostname: 'edge-2', ifName: 'Ethernet1/10', description: 'SAME' }),
      row({ id: 'a', hostname: 'edge-2', ifName: 'Ethernet1/2', description: 'same' }),
    ]

    expect(sortLegacyInterfaceRows(rows, {
      key: 'description', direction: 'asc', mode: 'delta', view: 'all',
    }).map(item => item.id)).toEqual(['a', 'c', 'b'])
  })

  test('sums only positive CRC deltas with exact BigInt arithmetic', () => {
    expect(sumLegacyCrcByInterface([
      { interfaceId: 'if-1', dCrcErrors: 9_007_199_254_740_993n },
      { interfaceId: 'if-1', dCrcErrors: 2n },
      { interfaceId: 'if-1', dCrcErrors: null },
      { interfaceId: 'if-2', dCrcErrors: 0n },
      { interfaceId: 'if-3', dCrcErrors: -1n },
    ])).toEqual(new Map([['if-1', 9_007_199_254_740_995n]]))
  })
})
