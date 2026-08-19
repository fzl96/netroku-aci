import { describe, expect, it } from 'bun:test'
import { DeviceStatus, StackRole } from '@prisma/client'
import { parseCsvRows, checkRequiredHeaders, normalizeHeaderName } from './csv'

describe('normalizeHeaderName', () => {
  it('trims, lowercases, and replaces hyphens and spaces with underscores', () => {
    expect(normalizeHeaderName(' Serial Number ')).toBe('serial_number')
    expect(normalizeHeaderName('Asset-Tag')).toBe('asset_tag')
    expect(normalizeHeaderName('Rack Position')).toBe('rack_position')
  })
})

describe('checkRequiredHeaders', () => {
  it('accepts canonical headers', () => {
    const err = checkRequiredHeaders(['hostname', 'serial_number', 'vendor', 'model'])
    expect(err).toBeNull()
  })

  it('accepts header aliases', () => {
    const err = checkRequiredHeaders(['name', 'serial', 'manufacturer', 'device_model'])
    expect(err).toBeNull()
  })

  it('rejects when required headers are missing', () => {
    const err = checkRequiredHeaders(['name', 'vendor'])
    expect(err).not.toBeNull()
    expect(err?.field).toBe('headers')
    expect(err?.message).toContain('Missing required column(s)')
  })
})

describe('parseCsvRows', () => {
  it('parses valid rows with aliases and default fallbacks', () => {
    const rawRows = [
      {
        name: 'sw-core-01',
        serial: 'SN-1001',
        tag: 'TAG-01',
        vendor: 'Cisco',
        model: 'Catalyst 9300',
        height: '2',
        site: 'DCI',
        rack: 'C1',
        position: '10',
        stack: 'ACC-01',
        role: 'master',
        member: '1',
      },
    ]
    const headers = ['name', 'serial', 'tag', 'vendor', 'model', 'height', 'site', 'rack', 'position', 'stack', 'role', 'member']
    const { rows, errors } = parseCsvRows(rawRows, headers)

    expect(errors).toHaveLength(0)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      rowIndex: 1,
      hostname: 'sw-core-01',
      serialNumber: 'SN-1001',
      assetTag: 'TAG-01',
      managementIp: null,
      status: DeviceStatus.ACTIVE,
      vendor: 'Cisco',
      model: 'Catalyst 9300',
      heightU: 2,
      site: 'DCI',
      rack: 'C1',
      rackPosition: 10,
      stackName: 'ACC-01',
      stackRole: StackRole.MASTER,
      switchId: 1,
    })
  })

  it('catches invalid status and stack role', () => {
    const rawRows = [
      {
        hostname: 'sw-01',
        serial_number: 'SN-1',
        vendor: 'Cisco',
        model: 'C9300',
        status: 'UNKNOWN_STATUS',
        stack_name: 'STACK-A',
        stack_role: 'LEADER',
      },
    ]
    const { errors } = parseCsvRows(rawRows, ['hostname', 'serial_number', 'vendor', 'model', 'status', 'stack_name', 'stack_role'])
    expect(errors.some((e) => e.field === 'status')).toBe(true)
    expect(errors.some((e) => e.field === 'stackRole')).toBe(true)
  })

  it('detects duplicate serial numbers inside the CSV', () => {
    const rawRows = [
      { hostname: 'sw-01', serial_number: 'SN-DUPE', vendor: 'Cisco', model: 'C9300' },
      { hostname: 'sw-02', serial_number: 'SN-DUPE', vendor: 'Cisco', model: 'C9300' },
    ]
    const { errors } = parseCsvRows(rawRows, ['hostname', 'serial_number', 'vendor', 'model'])
    expect(errors.some((e) => e.field === 'serialNumber' && e.message.includes('Duplicate serial number'))).toBe(true)
  })

  it('detects intra-CSV rack collisions considering multi-U height', () => {
    const rawRows = [
      {
        hostname: 'sw-2u',
        serial_number: 'SN-1',
        vendor: 'Cisco',
        model: 'C9500',
        height_u: '2',
        site: 'DCI',
        rack: 'C1',
        rack_position: '10', // occupies U10 and U11
      },
      {
        hostname: 'sw-1u',
        serial_number: 'SN-2',
        vendor: 'Cisco',
        model: 'C9300',
        height_u: '1',
        site: 'DCI',
        rack: 'C1',
        rack_position: '11', // collides with U11!
      },
    ]
    const { errors } = parseCsvRows(rawRows, ['hostname', 'serial_number', 'vendor', 'model', 'height_u', 'site', 'rack', 'rack_position'])
    expect(errors.some((e) => e.field === 'rackPosition' && e.message.includes('Rack collision'))).toBe(true)
  })

  it('detects duplicate switch IDs in the same stack inside the CSV', () => {
    const rawRows = [
      { hostname: 'sw-01', serial_number: 'SN-1', vendor: 'Cisco', model: 'C9300', stack_name: 'STK-1', switch_id: '1' },
      { hostname: 'sw-02', serial_number: 'SN-2', vendor: 'Cisco', model: 'C9300', stack_name: 'STK-1', switch_id: '1' },
    ]
    const { errors } = parseCsvRows(rawRows, ['hostname', 'serial_number', 'vendor', 'model', 'stack_name', 'switch_id'])
    expect(errors.some((e) => e.field === 'switchId' && e.message.includes('Duplicate switch #1 in stack'))).toBe(true)
  })

  it('validates managementIp format and detects intra-CSV duplicates', () => {
    const rawRows = [
      { hostname: 'sw-01', serial_number: 'SN-1', vendor: 'Cisco', model: 'C9300', ip: '10.0.0.1' },
      { hostname: 'sw-02', serial_number: 'SN-2', vendor: 'Cisco', model: 'C9300', ip: '10.0.0.1' },
      { hostname: 'sw-03', serial_number: 'SN-3', vendor: 'Cisco', model: 'C9300', ip: 'not-an-ip' },
    ]
    const { errors } = parseCsvRows(rawRows, ['hostname', 'serial_number', 'vendor', 'model', 'ip'])
    expect(errors.some((e) => e.field === 'managementIp' && e.message.includes('Duplicate management IP "10.0.0.1"'))).toBe(true)
    expect(errors.some((e) => e.field === 'managementIp' && e.message.includes('Invalid IP address'))).toBe(true)
  })
})
