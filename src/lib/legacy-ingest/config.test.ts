import { describe, expect, it, mock } from 'bun:test'
import type { Prisma } from '@prisma/client'
import { legacyConfigPayloadSchema, type LegacyConfigPayload } from '@/lib/schemas/legacy-ingest'
import { ConfigIngestConflictError } from './common'

mock.module('server-only', () => ({}))
mock.module('next/cache', () => ({
  revalidateTag: () => {},
  revalidatePath: () => {},
  unstable_cache: (fn: unknown) => fn,
}))
const { applyLegacyConfig } = await import('./config')
const { handleLegacyIngestRequest } = await import('./route')

const payload: LegacyConfigPayload = {
  schema_version: 1,
  run_id: '18d187a6-6509-40bd-b246-cc3798780efa',
  collected_at: '2026-10-13T03:00:00Z',
  complete: true,
  device: {
    site: 'jakarta',
    hostname: 'SW1',
    management_ip: '192.0.2.1',
    device_type: 'cisco_ios',
    serial_number: 'FCW1234',
  },
  configuration: {
    platform: 'iosxe',
    raw_config:
      'hostname SW1\nntp server 192.0.2.10\naaa group server tacacs+ ISE\n server-private 192.0.2.20 key 7 CONFIG_SECRET\n!\nend\n',
  },
}
type Link = {
  kind: string
  deviceId: string | null
  deviceStackId: string | null
  serialAtLink: string | null
  conflictReason: string | null
  device: { deviceStackId: string | null } | null
}
const link: Link = {
  kind: 'LEGACY',
  deviceId: 'inventory-device',
  deviceStackId: null,
  serialAtLink: 'FCW1234',
  conflictReason: null,
  device: { deviceStackId: null },
}

function context(
  source: Link | null = link,
  existing: { rawConfig: string; platform: string; collectedAt: Date } | null = null,
) {
  const writes: unknown[] = []
  const tx = {
    $queryRaw: async () => [],
    inventorySource: { findUnique: async () => source },
    inventoryConfig: {
      findUnique: async () => existing,
      upsert: async (args: unknown) => {
        writes.push(args)
        return {}
      },
    },
  } as unknown as Prisma.TransactionClient
  return {
    tx,
    writes,
    deviceId: 'legacy-device',
    receiptId: 'receipt',
    collectedAt: new Date(payload.collected_at),
  }
}

describe('legacy configuration ingestion', () => {
  it('writes raw text and its platform to the linked inventory device, not the legacy source ID', async () => {
    const ctx = context()
    expect(await applyLegacyConfig(ctx, payload)).toEqual({
      inserted: 1,
      updated: 0,
      cleared: 0,
      samples: 0,
    })
    expect(ctx.writes).toEqual([
      {
        where: { deviceId: 'inventory-device' },
        create: {
          deviceId: 'inventory-device',
          rawConfig: payload.configuration.raw_config,
          platform: 'iosxe',
          collectedAt: ctx.collectedAt,
        },
        update: {
          rawConfig: payload.configuration.raw_config,
          platform: 'iosxe',
          collectedAt: ctx.collectedAt,
        },
      },
    ])
  })

  it('saves a stack snapshot once without copying it onto physical members', async () => {
    const ctx = context({ ...link, deviceId: null, device: null, deviceStackId: 'inventory-stack' })
    await applyLegacyConfig(ctx, payload)
    expect(ctx.writes).toHaveLength(1)
    expect(ctx.writes[0]).toMatchObject({
      where: { deviceStackId: 'inventory-stack' },
      create: { deviceStackId: 'inventory-stack' },
    })
  })

  it('rejects missing, conflicted, wrong-serial and physical-member links before any write', async () => {
    for (const source of [
      null,
      { ...link, conflictReason: 'Serial changed' },
      { ...link, serialAtLink: 'OTHER' },
      { ...link, device: { deviceStackId: 'stack' } },
    ]) {
      const ctx = context(source)
      await expect(applyLegacyConfig(ctx, payload)).rejects.toBeInstanceOf(
        ConfigIngestConflictError,
      )
      expect(ctx.writes).toEqual([])
    }
  })

  it('does not regress newer snapshots and accepts matching same-time snapshots', async () => {
    for (const collectedAt of [new Date('2026-10-14'), new Date(payload.collected_at)]) {
      const ctx = context(link, {
        rawConfig: payload.configuration.raw_config,
        platform: 'iosxe',
        collectedAt,
      })
      expect((await applyLegacyConfig(ctx, payload)).updated).toBe(0)
      expect(ctx.writes).toEqual([])
    }
    const newer = context(link, {
      rawConfig: 'hostname old',
      platform: 'iosxe',
      collectedAt: new Date('2026-10-12'),
    })
    expect((await applyLegacyConfig(newer, payload)).updated).toBe(1)
    const conflict = context(link, {
      rawConfig: 'hostname different',
      platform: 'iosxe',
      collectedAt: new Date(payload.collected_at),
    })
    await expect(applyLegacyConfig(conflict, payload)).rejects.toThrow('same collection timestamp')
    expect(conflict.writes).toEqual([])
  })
})

function request(body: unknown, token = 'collector-token') {
  return new Request('http://localhost/api/ingest/legacy/config', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('configuration payload and route', () => {
  it('accepts and stores NX-OS configs whose caret-delimited banner starts with CCC', async () => {
    const ctx = context()
    const rawConfig =
      'hostname SW1\nbanner motd ^CCC\nAuthorized users only\n^\nntp server 192.0.2.10\n'
    const response = await handleLegacyIngestRequest(
      request({
        ...payload,
        device: { ...payload.device, device_type: 'cisco_nxos' },
        configuration: { platform: 'nxos', raw_config: rawConfig },
      }),
      legacyConfigPayloadSchema,
      async (parsed) => ({
        receipt_id: ctx.receiptId,
        duplicate: false,
        device_id: ctx.deviceId,
        counts: await applyLegacyConfig(ctx, parsed),
      }),
      'ingest.legacy.config',
      { token: 'collector-token', audit: async () => {}, invalidateReads: () => {} },
    )
    expect(response.status).toBe(201)
    expect(ctx.writes).toMatchObject([
      { create: { rawConfig, platform: 'nxos' }, update: { rawConfig, platform: 'nxos' } },
    ])
  })

  it('returns an actionable validation reason without exposing configuration values', async () => {
    let writes = 0
    const rawConfig = 'hostname switch\nbanner motd #\nCONFIG_SECRET'
    const response = await handleLegacyIngestRequest(
      request({
        ...payload,
        configuration: { platform: 'nxos', raw_config: rawConfig },
      }),
      legacyConfigPayloadSchema,
      async () => {
        writes++
        throw new Error('Invalid configurations must not reach ingestion')
      },
      'ingest.legacy.config',
      { token: 'collector-token', audit: async () => {}, invalidateReads: () => {} },
    )
    expect(response.status).toBe(422)
    const body = await response.text()
    expect(body).toContain('Saved configuration contains an incomplete banner')
    expect(body).not.toContain('CONFIG_SECRET')
    expect(writes).toBe(0)
  })

  it('identifies invalid fields without echoing submitted values or unknown keys', async () => {
    const cases = [
      {
        body: {
          ...payload,
          configuration: { platform: 'CONFIG_SECRET', raw_config: 'hostname sw' },
        },
        field: 'configuration.platform',
      },
      { body: { ...payload, device: { ...payload.device, model: '' } }, field: 'device.model' },
      { body: { ...payload, CONFIG_SECRET: 'CONFIG_SECRET' }, field: 'payload' },
    ]
    for (const { body, field } of cases) {
      const ingest = async () => {
        throw new Error('Invalid payloads must not reach ingestion')
      }
      const response = await handleLegacyIngestRequest(
        request(body),
        legacyConfigPayloadSchema,
        ingest,
        'ingest.legacy.config',
        { token: 'collector-token', audit: async () => {}, invalidateReads: () => {} },
      )
      expect(response.status).toBe(422)
      const text = await response.text()
      expect(text).toContain(field)
      expect(text).not.toContain('CONFIG_SECRET')
    }
  })

  it('accepts both platforms and IPv6/hostname service data for Unknown evaluation', () => {
    expect(legacyConfigPayloadSchema.safeParse(payload).success).toBe(true)
    expect(
      legacyConfigPayloadSchema.safeParse({
        ...payload,
        configuration: { platform: 'nxos', raw_config: 'hostname NX\nntp server ntp.example.com' },
      }).success,
    ).toBe(true)
  })

  it('rejects incomplete, empty, failed and oversized captures', async () => {
    const cases = [
      { ...payload, complete: false },
      { ...payload, configuration: { platform: 'other', raw_config: 'hostname sw' } },
      ...['', 'garbage', '% Invalid input', 'hostname sw\n--More--'].map((raw_config) => ({
        ...payload,
        configuration: { platform: 'iosxe', raw_config },
      })),
    ]
    for (const invalid of cases)
      expect(legacyConfigPayloadSchema.safeParse(invalid).success).toBe(false)
    let writes = 0
    const response = await handleLegacyIngestRequest(
      request({
        ...payload,
        configuration: { platform: 'iosxe', raw_config: 'x'.repeat(2_000_001) },
      }),
      legacyConfigPayloadSchema,
      async () => {
        writes++
        throw new Error()
      },
      'ingest.legacy.config',
      { token: 'collector-token', audit: async () => {}, invalidateReads: () => {} },
    )
    expect(response.status).toBe(413)
    expect(writes).toBe(0)
  })

  it('requires the existing collector token and returns actionable conflicts without raw text', async () => {
    const ingest = async () => {
      throw new ConfigIngestConflictError('Link this legacy device through Discovered devices')
    }
    const deps = { token: 'collector-token', audit: async () => {}, invalidateReads: () => {} }
    const denied = await handleLegacyIngestRequest(
      request(payload, 'wrong'),
      legacyConfigPayloadSchema,
      ingest,
      'ingest.legacy.config',
      deps,
    )
    expect(denied.status).toBe(401)
    const rejected = await handleLegacyIngestRequest(
      request(payload),
      legacyConfigPayloadSchema,
      ingest,
      'ingest.legacy.config',
      deps,
    )
    expect(rejected.status).toBe(409)
    const body = await rejected.text()
    expect(body).toContain('Discovered devices')
    expect(body).not.toContain('CONFIG_SECRET')
  })
})
