import { describe, expect, it, mock } from 'bun:test'
import * as XLSX from 'xlsx'
import type { EpgExportRow } from './export'

mock.module('server-only', () => ({}))

const {
  buildEpgWorkbook,
  serializeEpgWorkbook,
  expandNodeLeaves,
  filterEpgsByNode,
  sanitizeWorksheetName,
} = await import('./export')

type Binding = EpgExportRow['bindings'][number]

function binding(overrides: Partial<Binding> = {}): Binding {
  return {
    id: 'b-1',
    apicHostId: 'host-1',
    epgId: 'epg-1',
    dn: 'uni/tn-T1/ap-app/epg-web/rspathAtt-[topology/pod-1/paths-1103/pathep-[eth1/1]]',
    pathTDn: 'topology/pod-1/paths-1103/pathep-[eth1/1]',
    pod: '1',
    node: '1103',
    port: 'Eth1/1',
    pathType: 'port',
    encap: 'vlan-3192',
    mode: 'trunk',
    ...overrides,
  }
}

function epg(overrides: Partial<EpgExportRow> = {}): EpgExportRow {
  return {
    id: 'epg-1',
    apicHostId: 'host-1',
    dn: 'uni/tn-T1/ap-app/epg-VLAN3192_EPG',
    name: 'VLAN3192_EPG',
    tenant: 'T1',
    appProfile: 'app',
    description: 'web servers',
    bridgeDomain: 'BD1',
    pcTag: '',
    preferredGroup: false,
    isolation: false,
    domains: [],
    providedContracts: ['ctrct-A', 'ctrct-B'],
    consumedContracts: ['ctrct-C'],
    bindings: [
      binding({ id: 'b-1', node: '1103-1104', port: 'Eth1/1' }),
      binding({ id: 'b-2', node: '1103-1104', port: 'Eth1/2' }),
    ],
    ...overrides,
  }
}

function aoa(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][]
}

describe('EPG inventory exports', () => {
  const learned = (overrides: Partial<NonNullable<EpgExportRow['endpoints']>[number]> = {}) => ({
    mac: 'aa:bb:cc:dd:ee:ff',
    ip: '10.0.0.1',
    vlan: 'vlan-10',
    dn: 'uni/tn-T1/ap-app/epg-web/cep-aa:bb:cc:dd:ee:ff',
    node: '101-102',
    interface: 'vpc-web',
    epgDescr: 'Web',
    isActive: true,
    firstSeenAt: '2026-11-01T00:00:00.000Z',
    lastSeenAt: '2026-11-24T00:00:00.000Z',
    clearedAt: null,
    ...overrides,
  })

  it('exports exactly three summary columns, counting active MACs and logical vPC bindings once', () => {
    const workbook = buildEpgWorkbook(
      [
        epg({
          name: 'EPG_A',
          bindings: [binding({ node: '101-102', pathType: 'vpc' })],
          endpoints: [
            learned(),
            learned({ ip: '10.0.0.2' }),
            learned({ mac: 'AA:BB:CC:DD:EE:FF', ip: '' }),
            learned({ mac: '00:11:22:33:44:55', isActive: false }),
          ],
        }),
        epg({ id: 'empty', name: 'EPG_Empty', bindings: [], endpoints: [] }),
      ],
      'summary',
    )
    expect(workbook.SheetNames).toEqual(['EPG Summary'])
    expect(aoa(workbook.Sheets['EPG Summary'])).toEqual([
      ['EPG', 'Total Endpoint', 'Total Static Ports'],
      ['EPG_A', 1, 1],
      ['EPG_Empty', 0, 0],
    ])
  })

  it('keeps full endpoint and binding records on separate sheets and round-trips through XLSX', () => {
    const workbook = buildEpgWorkbook(
      [epg({ endpoints: [learned(), learned({ ip: '10.0.0.2' }), learned({ isActive: false })] })],
      'detailed',
    )
    expect(workbook.SheetNames).toEqual([
      'EPG Summary',
      'EPG Details',
      'Learned Endpoints',
      'Static Ports',
    ])
    const restored = XLSX.read(serializeEpgWorkbook(workbook), { type: 'array' })
    const endpointRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      restored.Sheets['Learned Endpoints'],
    )
    const bindingRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      restored.Sheets['Static Ports'],
    )
    expect(endpointRows).toHaveLength(2)
    expect(endpointRows[0]).toMatchObject({
      MAC: 'aa:bb:cc:dd:ee:ff',
      IP: '10.0.0.1',
      Node: '101-102',
      Interface: 'vpc-web',
      Status: 'Active',
      'First Seen': '2026-11-01T00:00:00.000Z',
    })
    expect(bindingRows).toHaveLength(2)
    expect(bindingRows[0]).toMatchObject({
      Node: '1103-1104',
      Encap: 'vlan-3192',
      Mode: 'trunk',
      'Path DN': expect.any(String),
      'Binding DN': expect.any(String),
    })
    expect(aoa(restored.Sheets['EPG Summary'])[1]).toEqual(['VLAN3192_EPG', 1, 2])
  })

  it('exports zero-data EPGs and header-only detail sheets', () => {
    const workbook = buildEpgWorkbook([epg({ bindings: [], endpoints: [] })], 'detailed')
    expect(aoa(workbook.Sheets['Learned Endpoints'])).toHaveLength(1)
    expect(aoa(workbook.Sheets['Static Ports'])).toHaveLength(1)
    expect(serializeEpgWorkbook(workbook).byteLength).toBeGreaterThan(0)
  })
})

function align(ws: XLSX.WorkSheet, address: string): { horizontal?: string; vertical?: string } {
  const cell = ws[address] as
    { s?: { alignment?: { horizontal?: string; vertical?: string } } } | undefined
  return cell?.s?.alignment ?? {}
}

describe('expandNodeLeaves', () => {
  it('splits a vPC node pair into individual leaves', () => {
    expect(expandNodeLeaves('1103-1104')).toEqual(['1103', '1104'])
  })

  it('returns a single-element list for a plain node', () => {
    expect(expandNodeLeaves('101')).toEqual(['101'])
  })
})

describe('sanitizeWorksheetName', () => {
  it('removes invalid Excel characters and caps names at 31 characters', () => {
    expect(sanitizeWorksheetName('node:/\\?*[]-abcdefghijklmnopqrstuvwxyz-extra')).toBe(
      'node-abcdefghijklmnopqrstuvwxyz',
    )
  })
})

describe('buildEpgWorkbook — group by EPG', () => {
  it('emits a single sheet with EPG detail columns and a leaf-split node/port hierarchy', () => {
    const workbook = buildEpgWorkbook([epg()], 'epg')

    expect(workbook.SheetNames).toEqual(['EPGs'])
    const ws = workbook.Sheets['EPGs']

    expect(aoa(ws)).toEqual([
      [
        'EPG',
        'Tenant',
        'App Profile',
        'Bridge Domain',
        'EPG Description',
        'Consumed',
        'Provided',
        'Node',
        'Port',
      ],
      [
        'VLAN3192_EPG',
        'T1',
        'app',
        'BD1',
        'web servers',
        'ctrct-C',
        'ctrct-A, ctrct-B',
        '1103',
        'Eth1/1',
      ],
      ['', '', '', '', '', '', '', '', 'Eth1/2'],
      ['', '', '', '', '', '', '', '1104', 'Eth1/1'],
      ['', '', '', '', '', '', '', '', 'Eth1/2'],
    ])

    // EPG-level column merged across all four data rows.
    expect(ws['!merges']).toContainEqual({ s: { r: 1, c: 0 }, e: { r: 4, c: 0 } })
    // App Profile is merged across every binding, just like the other EPG details.
    expect(ws['!merges']).toContainEqual({ s: { r: 1, c: 2 }, e: { r: 4, c: 2 } })
    // Node cells merged across their two ports.
    expect(ws['!merges']).toContainEqual({ s: { r: 1, c: 7 }, e: { r: 2, c: 7 } })
    expect(ws['!merges']).toContainEqual({ s: { r: 3, c: 7 }, e: { r: 4, c: 7 } })
  })

  it('centers the header row and detail columns, and vertically centers EPG and Port', () => {
    const ws = buildEpgWorkbook([epg()], 'epg').Sheets['EPGs']

    // Header row centered both ways.
    expect(align(ws, 'A1')).toEqual({ horizontal: 'center', vertical: 'center' })
    expect(align(ws, 'I1')).toEqual({ horizontal: 'center', vertical: 'center' })

    // Tenant / Node detail columns centered both ways.
    expect(align(ws, 'B2')).toEqual({ horizontal: 'center', vertical: 'center' })
    expect(align(ws, 'H2')).toEqual({ horizontal: 'center', vertical: 'center' })

    // EPG and Port only vertically centered.
    expect(align(ws, 'A2')).toEqual({ vertical: 'center' })
    expect(align(ws, 'I2')).toEqual({ vertical: 'center' })
  })

  it('natural-sorts ports so Eth1/2 precedes Eth1/10', () => {
    const workbook = buildEpgWorkbook(
      [
        epg({
          bindings: [
            binding({ id: 'b-1', node: '1103', port: 'Eth1/10' }),
            binding({ id: 'b-2', node: '1103', port: 'Eth1/2' }),
          ],
        }),
      ],
      'epg',
    )

    const rows = aoa(workbook.Sheets['EPGs'])
    expect(rows[1][8]).toBe('Eth1/2')
    expect(rows[2][8]).toBe('Eth1/10')
  })

  it('leaves Consumed and Provided empty when the EPG has no contracts', () => {
    const workbook = buildEpgWorkbook(
      [epg({ providedContracts: [], consumedContracts: [] })],
      'epg',
    )

    const rows = aoa(workbook.Sheets['EPGs'])
    expect(rows[1][5]).toBe('')
    expect(rows[1][6]).toBe('')
  })

  it('renders an EPG with no bindings as a single row with empty node/port', () => {
    const workbook = buildEpgWorkbook([epg({ bindings: [] })], 'epg')

    expect(aoa(workbook.Sheets['EPGs'])).toEqual([
      [
        'EPG',
        'Tenant',
        'App Profile',
        'Bridge Domain',
        'EPG Description',
        'Consumed',
        'Provided',
        'Node',
        'Port',
      ],
      ['VLAN3192_EPG', 'T1', 'app', 'BD1', 'web servers', 'ctrct-C', 'ctrct-A, ctrct-B', '', ''],
    ])
  })
})

describe('buildEpgWorkbook — EPG details only', () => {
  it('exports one row per EPG with all detail columns and no nodes or ports', () => {
    const workbook = buildEpgWorkbook([epg()], 'epg-details')
    // Check the downloaded workbook as well as the in-memory representation.
    const downloaded = XLSX.read(serializeEpgWorkbook(workbook), { type: 'array' })

    expect(downloaded.SheetNames).toEqual(['EPGs'])
    const ws = downloaded.Sheets['EPGs']
    expect(aoa(ws)).toEqual([
      ['EPG', 'Tenant', 'App Profile', 'Bridge Domain', 'EPG Description', 'Consumed', 'Provided'],
      ['VLAN3192_EPG', 'T1', 'app', 'BD1', 'web servers', 'ctrct-C', 'ctrct-A, ctrct-B'],
    ])
    expect(ws['!ref']).toBe('A1:G2')
    expect(ws['!merges'] ?? []).toEqual([])
  })

  it('includes unbound EPGs and keeps natural tenant/name ordering without combining names', () => {
    const workbook = buildEpgWorkbook(
      [
        epg({ id: '3', name: 'EPG2', tenant: 'T2' }),
        epg({ id: '2', name: 'EPG10', bindings: [] }),
        epg({ id: '1', name: 'EPG2', bindings: [], consumedContracts: [], providedContracts: [] }),
      ],
      'epg-details',
    )

    expect(aoa(workbook.Sheets['EPGs'])).toEqual([
      ['EPG', 'Tenant', 'App Profile', 'Bridge Domain', 'EPG Description', 'Consumed', 'Provided'],
      ['EPG2', 'T1', 'app', 'BD1', 'web servers', '', ''],
      ['EPG10', 'T1', 'app', 'BD1', 'web servers', 'ctrct-C', 'ctrct-A, ctrct-B'],
      ['EPG2', 'T2', 'app', 'BD1', 'web servers', 'ctrct-C', 'ctrct-A, ctrct-B'],
    ])
  })
})

describe('buildEpgWorkbook — group by Port', () => {
  it('emits one sheet per leaf node with comma-joined EPG names per port', () => {
    const epg1 = epg()
    const epg2 = epg({
      id: 'epg-2',
      name: 'VLAN3193_EPG',
      bindings: [binding({ id: 'b-3', epgId: 'epg-2', node: '1103', port: 'Eth1/1' })],
    })

    const workbook = buildEpgWorkbook([epg1, epg2], 'port')

    expect(workbook.SheetNames).toEqual(['1103', '1104'])

    expect(aoa(workbook.Sheets['1103'])).toEqual([
      ['Node', 'Port', 'EPG'],
      ['1103', 'Eth1/1', 'VLAN3192_EPG, VLAN3193_EPG'],
      ['', 'Eth1/2', 'VLAN3192_EPG'],
    ])

    expect(aoa(workbook.Sheets['1104'])).toEqual([
      ['Node', 'Port', 'EPG'],
      ['1104', 'Eth1/1', 'VLAN3192_EPG'],
      ['', 'Eth1/2', 'VLAN3192_EPG'],
    ])

    // Node cell merged down the sheet.
    expect(workbook.Sheets['1103']['!merges']).toContainEqual({
      s: { r: 1, c: 0 },
      e: { r: 2, c: 0 },
    })
  })
})

describe('filterEpgsByNode', () => {
  it('keeps only bindings whose leaves intersect the selected nodes and drops empty EPGs', () => {
    const epg1 = epg()
    const epg2 = epg({
      id: 'epg-2',
      name: 'VLAN3193_EPG',
      bindings: [binding({ id: 'b-3', epgId: 'epg-2', node: '1105', port: 'Eth1/1' })],
    })

    const result = filterEpgsByNode([epg1, epg2], ['1104'])

    expect(result.map((e) => e.id)).toEqual(['epg-1'])
    expect(result[0].bindings.map((b) => b.id)).toEqual(['b-1', 'b-2'])
  })
})
