import { describe, expect, it } from 'bun:test'
import {
  buildInterfaceSamplesCsv,
  INTERFACE_EXPORT_HEADER,
  interfaceExportFilename,
  type InterfaceExportSample,
} from './export'

function sample(overrides: Partial<InterfaceExportSample> = {}): InterfaceExportSample {
  return {
    sampledAt: new Date('2026-01-01T00:00:00Z'),
    adminSt: 'up',
    operSt: 'up',
    operSpeed: '10G',
    rxBytes: BigInt(1), rxPkts: BigInt(2), rxErrors: BigInt(3), rxDiscards: BigInt(4),
    rxCrcErrors: BigInt(5), rxAlignErrors: BigInt(6),
    txBytes: BigInt(7), txPkts: BigInt(8), txErrors: BigInt(9), txDiscards: BigInt(10),
    dRxBytes: BigInt(11), dRxErrors: BigInt(12), dRxDiscards: BigInt(13),
    dRxCrcErrors: BigInt(14), dRxAlignErrors: BigInt(15),
    dTxBytes: BigInt(16), dTxErrors: BigInt(17), dTxDiscards: BigInt(18),
    interface: {
      node: 'leaf-1', ifName: 'eth1/1', usage: 'epg',
      description: 'uplink', dn: 'topology/pod-1/eth1-1',
    },
    ...overrides,
  }
}

describe('buildInterfaceSamplesCsv', () => {
  it('starts with the documented header row', () => {
    const csv = buildInterfaceSamplesCsv([sample()])
    expect(csv.split('\n')[0]).toBe(INTERFACE_EXPORT_HEADER.join(','))
    expect(INTERFACE_EXPORT_HEADER[0]).toBe('sampledAt')
    expect(INTERFACE_EXPORT_HEADER).toHaveLength(26)
  })

  it('writes one trailing-newline-terminated row per sample', () => {
    const csv = buildInterfaceSamplesCsv([sample(), sample()])
    expect(csv.endsWith('\n')).toBe(true)
    expect(csv.trimEnd().split('\n')).toHaveLength(3)
  })

  it('serializes counters and interface columns in header order', () => {
    const csv = buildInterfaceSamplesCsv([sample()])
    expect(csv.trimEnd().split('\n')[1]).toBe(
      '2026-01-01T00:00:00.000Z,leaf-1,eth1/1,epg,uplink,up,up,10G,'
      + '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18',
    )
  })

  it('renders absent deltas as empty cells', () => {
    const csv = buildInterfaceSamplesCsv([sample({
      dRxBytes: null, dRxErrors: null, dRxDiscards: null,
      dRxCrcErrors: null, dRxAlignErrors: null,
      dTxBytes: null, dTxErrors: null, dTxDiscards: null,
    })])
    expect(csv.trimEnd().split('\n')[1].endsWith(',10,,,,,,,,')).toBe(true)
  })

  it('quotes values containing commas, quotes, or newlines', () => {
    const csv = buildInterfaceSamplesCsv([sample({
      interface: {
        node: 'leaf,1', ifName: 'eth"1', usage: 'epg',
        description: 'line\nbreak', dn: 'dn',
      },
    })])
    const row = csv.trimEnd().split('\n').slice(1).join('\n')
    expect(row).toContain('"leaf,1"')
    expect(row).toContain('"eth""1"')
    expect(row).toContain('"line\nbreak"')
  })

  it('renders a null description as an empty cell', () => {
    const csv = buildInterfaceSamplesCsv([sample({
      interface: {
        node: 'leaf-1', ifName: 'eth1/1', usage: 'epg', description: null, dn: 'dn',
      },
    })])
    expect(csv.trimEnd().split('\n')[1]).toContain('leaf-1,eth1/1,epg,,up,up')
  })
})

describe('interfaceExportFilename', () => {
  it('slugifies the host name and stamps the time', () => {
    expect(interfaceExportFilename('Prod APIC #1', new Date('2026-01-02T03:04:05.678Z')))
      .toBe('interfaces-prod-apic-1-2026-01-02T03-04-05-678Z')
  })

  it('falls back to a placeholder when the name has no usable characters', () => {
    expect(interfaceExportFilename('***', new Date('2026-01-02T03:04:05.678Z')))
      .toBe('interfaces-host-2026-01-02T03-04-05-678Z')
  })
})
