import { describe, expect, it } from 'bun:test'
import * as XLSX from 'xlsx'
import type { Endpoint } from '@prisma/client'
import {
  buildEndpointWorkbook,
  groupEndpointsForExport,
  sanitizeWorksheetName,
} from './export'

function endpoint(overrides: Partial<Endpoint> = {}): Endpoint {
  return {
    id: 'ep-1',
    apicHostId: 'host-1',
    mac: 'aa:bb:cc:dd:ee:ff',
    ip: '10.0.0.1',
    vlan: 'vlan-100',
    dn: 'uni/tn-test/ap-app/epg-web/cep-aa:bb:cc:dd:ee:ff',
    node: '101',
    interface: 'eth1/1',
    epgDescr: 'Web',
    isActive: true,
    firstSeenAt: new Date('2026-05-16T08:00:00.000Z'),
    lastSeenAt: new Date('2026-05-16T09:00:00.000Z'),
    clearedAt: null,
    ...overrides,
  }
}

describe('groupEndpointsForExport', () => {
  it('groups rows into node buckets and routes blanks to Unassigned', () => {
    const grouped = groupEndpointsForExport([
      endpoint({ id: 'ep-1', node: '101' }),
      endpoint({ id: 'ep-2', node: '' }),
      endpoint({ id: 'ep-3', node: '102' }),
    ], 'node')

    expect(Array.from(grouped.keys())).toEqual(['101', 'Unassigned', '102'])
    expect(grouped.get('101')?.map(ep => ep.id)).toEqual(['ep-1'])
    expect(grouped.get('Unassigned')?.map(ep => ep.id)).toEqual(['ep-2'])
  })

  it('groups rows into VLAN buckets', () => {
    const grouped = groupEndpointsForExport([
      endpoint({ id: 'ep-1', vlan: 'vlan-100' }),
      endpoint({ id: 'ep-2', vlan: 'vlan-200' }),
    ], 'vlan')

    expect(Array.from(grouped.keys())).toEqual(['vlan-100', 'vlan-200'])
  })
})

describe('sanitizeWorksheetName', () => {
  it('removes invalid Excel characters and caps names at 31 characters', () => {
    expect(sanitizeWorksheetName('node:/\\?*[]-abcdefghijklmnopqrstuvwxyz-extra')).toBe('node-abcdefghijklmnopqrstuvwxyz')
  })
})

describe('buildEndpointWorkbook', () => {
  it('creates separate worksheets with visible table columns and last-seen ordering', () => {
    const workbook = buildEndpointWorkbook([
      endpoint({
        id: 'older',
        node: 'node:/bad',
        lastSeenAt: new Date('2026-05-16T08:00:00.000Z'),
        isActive: false,
      }),
      endpoint({
        id: 'newer',
        node: 'node:/bad',
        mac: '11:22:33:44:55:66',
        ip: '',
        lastSeenAt: new Date('2026-05-16T10:00:00.000Z'),
      }),
      endpoint({
        id: 'other',
        node: '',
      }),
    ], 'node')

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
    const parsed = XLSX.read(buffer, { type: 'buffer', cellDates: true })

    expect(parsed.SheetNames).toEqual(['node-bad', 'Unassigned'])

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(parsed.Sheets['node-bad'])
    expect(Object.keys(rows[0] ?? {})).toEqual([
      'MAC',
      'IP',
      'VLAN',
      'Node',
      'Interface',
      'EPG Description',
      'First Seen',
      'Last Seen',
      'Status',
    ])
    expect(rows.map(row => row.MAC)).toEqual(['11:22:33:44:55:66', 'aa:bb:cc:dd:ee:ff'])
    expect(rows.map(row => row.Status)).toEqual(['Active', 'Historical'])
  })

  it('deduplicates worksheet names after sanitizing collisions', () => {
    const workbook = buildEndpointWorkbook([
      endpoint({ id: 'ep-1', vlan: 'bad/name' }),
      endpoint({ id: 'ep-2', vlan: 'bad:name' }),
    ], 'vlan')

    expect(workbook.SheetNames).toEqual(['bad-name', 'bad-name-2'])
  })
})
