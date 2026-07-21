import { describe, expect, it } from 'bun:test'
import { applyLegacyHealth } from './health'

const payload = {
  schema_version: 1 as const,
  run_id: '18d187a6-6509-40bd-b246-cc3798780efa',
  collected_at: '2026-07-21T14:30:00+07:00',
  complete: true as const,
  device: {
    site: 'jakarta', hostname: 'SW-JKT-01',
    management_ip: '10.10.0.11', device_type: 'cisco_ios',
  },
  health: {
    uptime: '1 day', cpu_percent: 10, memory_percent: 20,
    storage_percent: null, temperature_celsius: 35,
    fan_statuses: ['OK'], psu_statuses: ['OK'],
  },
  logs: [
    { timestamp: '2026-07-21T14:20:00+07:00', severity: 'ERROR', message: 'down', raw: 'timestamped' },
    { timestamp: null, severity: null, message: 'raw event', raw: 'raw event' },
  ],
}

describe('applyLegacyHealth', () => {
  it('creates a health sample, deduplicated logs, and sync timestamp', async () => {
    const calls: Record<string, unknown>[] = []
    const tx = {
      legacyHealthSample: { create: async (args: unknown) => calls.push({ sample: args }) },
      legacyLogEntry: {
        createMany: async (args: { data: unknown[]; skipDuplicates: boolean }) => {
          calls.push({ logs: args })
          return { count: 2 }
        },
      },
      legacyDevice: { update: async (args: unknown) => calls.push({ device: args }) },
    }

    const counts = await applyLegacyHealth({
      tx,
      deviceId: 'device-1',
      receiptId: 'receipt-1',
      collectedAt: new Date(payload.collected_at),
    }, payload)

    expect(counts).toEqual({ inserted: 2, updated: 0, cleared: 0, samples: 1 })
    expect(calls).toHaveLength(3)
    const logs = (calls[1].logs as { data: Array<{ eventHash: string }> }).data
    expect(logs[0].eventHash).not.toBe(logs[1].eventHash)
    expect(logs.every(log => log.eventHash.length === 64)).toBe(true)
  })
})
