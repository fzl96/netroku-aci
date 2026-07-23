import { describe, expect, it } from 'bun:test'
import {
  legacyEndpointPayloadSchema,
  legacyHealthPayloadSchema,
  legacyInterfacePayloadSchema,
} from './legacy-ingest'

const base = {
  schema_version: 1 as const,
  run_id: '18d187a6-6509-40bd-b246-cc3798780efa',
  collected_at: '2026-07-21T14:30:00+07:00',
  complete: true as const,
  device: {
    site: 'jakarta',
    hostname: 'SW-JKT-01',
    management_ip: '10.10.0.11',
    device_type: 'cisco_ios',
  },
}

const interfaceRow = {
  name: 'GigabitEthernet1/0/1',
  description: '',
  ip_address: null,
  prefix_length: null,
  mtu: 1500,
  speed: '1000 Mb/s',
  admin_state: 'up',
  oper_state: 'up',
  input_errors: '0',
  output_errors: '0',
  crc_errors: '0',
}

describe('legacy ingestion schemas', () => {
  it('accepts valid health, interface, and endpoint payloads', () => {
    expect(legacyHealthPayloadSchema.safeParse({
      ...base,
      health: {
        uptime: '1 day', cpu_percent: 1, memory_percent: 2,
        storage_percent: 3, temperature_celsius: null,
        fan_statuses: ['OK'], psu_statuses: [],
      },
      logs: [],
    }).success).toBe(true)
    expect(legacyInterfacePayloadSchema.safeParse({
      ...base,
      interfaces: [interfaceRow],
    }).success).toBe(true)
    expect(legacyEndpointPayloadSchema.safeParse({
      ...base,
      endpoints: [{
        mac: '00:11:22:33:44:55', ip: null,
        interface: 'GigabitEthernet1/0/1', vlan: '10',
        vlan_name: 'USERS', learning_type: 'dynamic',
      }],
    }).success).toBe(true)
  })

  it('preserves endpoint MAC markers and defaults older payloads to no marker', () => {
    const endpoint = {
      mac: '00:11:22:33:44:55',
      ip: null,
      interface: 'GigabitEthernet1/0/1',
      vlan: '10',
      vlan_name: 'USERS',
      learning_type: 'dynamic',
    }
    const withMarker = legacyEndpointPayloadSchema.parse({
      ...base,
      endpoints: [{ ...endpoint, mac_flag: '+' }],
    })
    const withoutMarker = legacyEndpointPayloadSchema.parse({
      ...base,
      endpoints: [endpoint],
    })

    expect(withMarker.endpoints[0].mac_flag).toBe('+')
    expect(withoutMarker.endpoints[0].mac_flag).toBe('')
  })

  it('rejects unsupported versions, incomplete snapshots, and timestamps without offsets', () => {
    expect(legacyHealthPayloadSchema.safeParse({
      ...base, schema_version: 2, health: {}, logs: [],
    }).success).toBe(false)
    expect(legacyHealthPayloadSchema.safeParse({
      ...base, complete: false, health: {}, logs: [],
    }).success).toBe(false)
    expect(legacyHealthPayloadSchema.safeParse({
      ...base, collected_at: '2026-07-21T14:30:00', health: {}, logs: [],
    }).success).toBe(false)
  })

  it('rejects invalid percentages, counters, and MAC addresses', () => {
    expect(legacyHealthPayloadSchema.safeParse({
      ...base,
      health: { cpu_percent: 101 },
      logs: [],
    }).success).toBe(false)
    expect(legacyInterfacePayloadSchema.safeParse({
      ...base,
      interfaces: [{ ...interfaceRow, crc_errors: '-1' }],
    }).success).toBe(false)
    expect(legacyEndpointPayloadSchema.safeParse({
      ...base,
      endpoints: [{
        mac: '0011.2233.4455', ip: null, interface: 'Gi1/0/1',
        vlan: '10', vlan_name: '', learning_type: 'dynamic',
      }],
    }).success).toBe(false)
  })

  it('enforces feature collection limits', () => {
    expect(legacyHealthPayloadSchema.safeParse({
      ...base,
      health: {},
      logs: Array.from({ length: 501 }, () => ({
        timestamp: null, severity: null, message: 'event', raw: 'event',
      })),
    }).success).toBe(false)
    expect(legacyInterfacePayloadSchema.safeParse({
      ...base,
      interfaces: Array.from({ length: 20_001 }, () => interfaceRow),
    }).success).toBe(false)
  })
})
