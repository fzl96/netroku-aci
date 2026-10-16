import { describe, expect, it } from 'bun:test'
import * as XLSX from 'xlsx'
import { buildDeviceExportFilename, buildDeviceWorkbook, serializeDeviceWorkbook } from './export'
import type { SafeDeviceWithRack } from './query'

function device(overrides: Partial<SafeDeviceWithRack> = {}): SafeDeviceWithRack {
  return {
    id: 'd1',
    name: 'leaf-01',
    serialNumber: '001234',
    assetTag: 'ASSET-01',
    managementIp: '10.0.0.1',
    status: 'ACTIVE',
    vendor: 'Cisco',
    model: 'N9K',
    version: '16.0',
    rackId: 'r1',
    rackPosition: 12,
    heightU: 2,
    rack: { id: 'r1', name: 'Rack 1', site: { id: 's1', name: 'HQ' } },
    deviceStackId: null,
    deviceStack: null,
    stackMember: null,
    stackRole: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('device workbook', () => {
  it('round trips inventory columns, serials, placement numbers and stack details in one worksheet', () => {
    const workbook = buildDeviceWorkbook([
      device({
        deviceStack: { id: 'stack1', name: 'Core', source: { kind: 'LEGACY' } },
        stackRole: 'MASTER',
        stackMember: 1,
      }),
      device({
        name: 'aci-leaf',
        source: {
          id: 'source1',
          kind: 'ACI',
          sourceLabel: 'ACI leaf',
          conflictReason: null,
          nodeSnapshotId: null,
          legacyDeviceId: null,
        },
      }),
      device({ name: 'manual' }),
    ])
    const parsed = XLSX.read(serializeDeviceWorkbook(workbook), { type: 'array' })
    expect(parsed.SheetNames).toEqual(['Devices'])
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(parsed.Sheets.Devices)
    expect(rows[0]).toEqual({
      Name: 'leaf-01',
      Source: 'Legacy',
      Serial: '001234',
      'Asset Tag': 'ASSET-01',
      'Management IP': '10.0.0.1',
      Status: 'Active',
      Vendor: 'Cisco',
      Model: 'N9K',
      Version: '16.0',
      Site: 'HQ',
      Rack: 'Rack 1',
      'Rack Position': 12,
      'Height (U)': 2,
      Stack: 'Core',
      'Stack Role': 'Master',
      'Stack Member': 1,
    })
    expect(rows.map((row) => row.Source)).toEqual(['Legacy', 'ACI', 'Unlinked'])
    expect(parsed.Sheets.Devices['!autofilter']?.ref).toBe('A1:P4')
  })

  it('leaves missing values blank and stores formula-like names as plain text', () => {
    const workbook = buildDeviceWorkbook([
      device({
        name: '=1+1',
        assetTag: null,
        managementIp: null,
        version: null,
        rackId: null,
        rack: null,
        rackPosition: null,
      }),
    ])
    const parsed = XLSX.read(serializeDeviceWorkbook(workbook), { type: 'array' })
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(parsed.Sheets.Devices, {
      defval: '',
    })
    expect(rows[0]).toMatchObject({
      Name: '=1+1',
      'Asset Tag': '',
      'Management IP': '',
      Version: '',
      Site: '',
      Rack: '',
      'Rack Position': '',
      Stack: '',
      'Stack Role': '',
      'Stack Member': '',
    })
    expect(parsed.Sheets.Devices.A2.t).toBe('s')
    expect(parsed.Sheets.Devices.A2.f).toBeUndefined()
  })

  it('names downloads by inventory, scope and timestamp', () => {
    expect(buildDeviceExportFilename('filtered', new Date('2026-10-16T03:04:05Z'))).toBe(
      'inventory-devices-filtered-2026-10-16T03-04-05-000Z.xlsx',
    )
  })
})
