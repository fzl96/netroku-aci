import { describe, expect, it } from 'bun:test'
import {
  IdempotencyConflictError,
  canonicalPayloadHash,
  ingestLegacyFeature,
  normalizeLegacyKey,
  type LegacyIngestCounts,
} from './common'

const payload = {
  schema_version: 1 as const,
  run_id: '18d187a6-6509-40bd-b246-cc3798780efa',
  collected_at: '2026-07-21T14:30:00+07:00',
  complete: true as const,
  device: {
    site: ' Jakarta ', hostname: ' SW-JKT-01 ',
    management_ip: '10.10.0.11', device_type: 'cisco_ios',
    vendor: 'Cisco',
  },
}

function fakeDb(existingReceipt?: Record<string, unknown>) {
  const state = {
    upsertArgs: null as Record<string, unknown> | null,
    receipt: existingReceipt ?? null,
    receiptUpdate: null as Record<string, unknown> | null,
  }
  const client = {
    legacyDevice: {
      upsert: async (args: Record<string, unknown>) => {
        state.upsertArgs = args
        return { id: 'device-1' }
      },
      findUnique: async () => ({ id: 'device-1' }),
    },
    legacyIngestReceipt: {
      findUnique: async () => state.receipt,
      create: async (args: { data: Record<string, unknown> }) => {
        state.receipt = { id: 'receipt-1', ...args.data }
        return state.receipt
      },
      update: async (args: Record<string, unknown>) => {
        state.receiptUpdate = args
        return args
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(client),
  }
  return { client, state }
}

describe('legacy ingestion common helpers', () => {
  it('normalizes external identity keys', () => {
    expect(normalizeLegacyKey('  SW-Étage  ')).toBe('sw-étage')
  })

  it('hashes object keys canonically while preserving array order', () => {
    expect(canonicalPayloadHash({ a: 1, b: 2 })).toBe(
      canonicalPayloadHash({ b: 2, a: 1 }),
    )
    expect(canonicalPayloadHash({ a: [1, 2] })).not.toBe(
      canonicalPayloadHash({ a: [2, 1] }),
    )
  })

  it('upserts the device, applies writes, and returns receipt counts', async () => {
    const { client, state } = fakeDb()
    const counts: LegacyIngestCounts = { inserted: 1, updated: 2, cleared: 3, samples: 4 }
    const result = await ingestLegacyFeature(
      client as never,
      'health',
      payload,
      async context => {
        expect(context.deviceId).toBe('device-1')
        expect(context.receiptId).toBe('receipt-1')
        return counts
      },
    )

    expect(result).toEqual({
      receipt_id: 'receipt-1', duplicate: false, device_id: 'device-1', counts,
    })
    expect(state.upsertArgs).not.toBeNull()
    expect(state.receiptUpdate).not.toBeNull()
  })

  it('returns an identical receipt without applying feature writes', async () => {
    const hash = canonicalPayloadHash(payload)
    const { client } = fakeDb({
      id: 'receipt-existing', payloadHash: hash,
      inserted: 1, updated: 0, cleared: 0, samples: 1,
    })
    let calls = 0
    const result = await ingestLegacyFeature(
      client as never,
      'health',
      payload,
      async () => {
        calls += 1
        return { inserted: 0, updated: 0, cleared: 0, samples: 0 }
      },
    )

    expect(calls).toBe(0)
    expect(result.duplicate).toBe(true)
    expect(result.receipt_id).toBe('receipt-existing')
  })

  it('rejects reuse of an idempotency key with changed content', async () => {
    const { client } = fakeDb({
      id: 'receipt-existing', payloadHash: 'different',
      inserted: 0, updated: 0, cleared: 0, samples: 0,
    })
    expect(ingestLegacyFeature(
      client as never,
      'health',
      payload,
      async () => ({ inserted: 0, updated: 0, cleared: 0, samples: 0 }),
    )).rejects.toBeInstanceOf(IdempotencyConflictError)
  })
})
