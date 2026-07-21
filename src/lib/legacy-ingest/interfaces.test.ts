import { describe, expect, it } from 'bun:test'
import { applyLegacyInterfaces, computeLegacyDelta } from './interfaces'

const basePayload = {
  schema_version: 1 as const,
  run_id: '18d187a6-6509-40bd-b246-cc3798780efa',
  collected_at: '2026-07-21T14:30:00+07:00',
  complete: true as const,
  device: {
    site: 'jakarta', hostname: 'sw1', management_ip: '10.0.0.1', device_type: 'cisco_ios',
  },
  interfaces: [{
    name: 'GigabitEthernet1/0/1', description: 'user', ip_address: null,
    prefix_length: null, mtu: 1500, speed: '1G', admin_state: 'up', oper_state: 'up',
    input_errors: '12', output_errors: '7', crc_errors: '5',
  }],
}

describe('computeLegacyDelta', () => {
  it('returns null for first samples and resets', () => {
    expect(computeLegacyDelta(BigInt(5), null)).toBeNull()
    expect(computeLegacyDelta(BigInt(5), BigInt(10))).toBeNull()
  })

  it('subtracts monotonic counters without precision loss', () => {
    expect(computeLegacyDelta(BigInt('90071992547409930'), BigInt('90071992547409900')))
      .toBe(BigInt(30))
  })
})

describe('applyLegacyInterfaces', () => {
  it('upserts snapshots, clears omitted rows, and appends counter samples', async () => {
    const calls: Record<string, unknown>[] = []
    const tx = {
      legacyInterfaceSnapshot: {
        findMany: async () => [
          { id: 'if-existing', ifNameKey: 'gigabitethernet1/0/1' },
          { id: 'if-missing', ifNameKey: 'gigabitethernet1/0/2' },
        ],
        upsert: async (args: unknown) => {
          calls.push({ upsert: args })
          return { id: 'if-existing', ifNameKey: 'gigabitethernet1/0/1' }
        },
        updateMany: async (args: unknown) => {
          calls.push({ clear: args })
          return { count: 1 }
        },
      },
      legacyInterfaceSample: {
        findFirst: async () => ({ inputErrors: BigInt(10), outputErrors: BigInt(2), crcErrors: BigInt(8) }),
        create: async (args: { data: Record<string, unknown> }) => calls.push({ sample: args }),
      },
      legacyDevice: { update: async (args: unknown) => calls.push({ device: args }) },
    }

    const counts = await applyLegacyInterfaces({
      tx, deviceId: 'device-1', receiptId: 'receipt-1',
      collectedAt: new Date(basePayload.collected_at),
    }, basePayload)

    expect(counts).toEqual({ inserted: 0, updated: 1, cleared: 1, samples: 1 })
    const sample = (calls.find(call => call.sample)?.sample as { data: Record<string, unknown> }).data
    expect(sample.dInputErrors).toBe(BigInt(2))
    expect(sample.dOutputErrors).toBe(BigInt(5))
    expect(sample.dCrcErrors).toBeNull()
  })

  it('deduplicates interface names case-insensitively', async () => {
    let upserts = 0
    const tx = {
      legacyInterfaceSnapshot: {
        findMany: async () => [],
        upsert: async () => { upserts += 1; return { id: 'if-1', ifNameKey: 'gi1/0/1' } },
        updateMany: async () => ({ count: 0 }),
      },
      legacyInterfaceSample: {
        findFirst: async () => null,
        create: async () => undefined,
      },
      legacyDevice: { update: async () => undefined },
    }
    await applyLegacyInterfaces({
      tx, deviceId: 'd1', receiptId: 'r1', collectedAt: new Date(),
    }, {
      ...basePayload,
      interfaces: [
        { ...basePayload.interfaces[0], name: 'Gi1/0/1' },
        { ...basePayload.interfaces[0], name: ' gi1/0/1 ' },
      ],
    })
    expect(upserts).toBe(1)
  })
})
