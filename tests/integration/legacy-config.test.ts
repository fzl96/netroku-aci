import { afterAll, beforeAll, describe, expect, test, mock } from 'bun:test'
import { PrismaClient } from '@prisma/client'

const url = process.env.INVENTORY_TEST_DATABASE_URL
const enabled = Boolean(
  url &&
  ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname) &&
  new URL(url).pathname === '/inventory_test',
)
if (enabled) {
  process.env.DATABASE_URL = url!
  mock.module('server-only', () => ({}))
  mock.module('next/cache', () => ({
    revalidateTag: () => {},
    revalidatePath: () => {},
    unstable_cache: (fn: unknown) => fn,
  }))
}
const db = enabled ? new PrismaClient({ datasourceUrl: url }) : null
const suite = enabled ? describe : describe.skip
suite('legacy config HTTP contract and PostgreSQL storage', () => {
  const prefix = `config-it-${Date.now()}`
  let ingest: typeof import('../../src/lib/legacy-ingest/config').ingestLegacyConfig
  let handle: typeof import('../../src/lib/legacy-ingest/route').handleLegacyIngestRequest
  let deviceId: string
  let legacyId: string
  beforeAll(async () => {
    ingest = (await import('../../src/lib/legacy-ingest/config')).ingestLegacyConfig
    handle = (await import('../../src/lib/legacy-ingest/route')).handleLegacyIngestRequest
    const asset = await db!.device.create({
      data: { name: prefix, serialNumber: prefix, vendor: 'Cisco', model: 'C9300', heightU: 1 },
    })
    deviceId = asset.id
    const legacy = await db!.legacyDevice.create({
      data: {
        site: prefix,
        siteKey: prefix,
        hostname: prefix,
        hostnameKey: prefix,
        managementIp: '192.0.2.1',
        deviceType: 'cisco_ios',
        serialNumber: prefix,
      },
    })
    legacyId = legacy.id
    await db!.inventorySource.create({
      data: {
        deviceId,
        legacyDeviceId: legacyId,
        kind: 'LEGACY',
        sourceKey: `${prefix}|${prefix}`,
        sourceLabel: prefix,
        matchedOn: 'SERIAL',
        serialAtLink: prefix,
      },
    })
  })
  afterAll(async () => {
    await db!.device.deleteMany({ where: { serialNumber: { startsWith: prefix } } })
    await db!.deviceStack.deleteMany({ where: { name: { startsWith: prefix } } })
    await db!.legacyDevice.deleteMany({ where: { siteKey: prefix } })
    await db!.inventoryReconcileJob.deleteMany({
      where: { kind: 'LEGACY', sourceRecordId: legacyId },
    })
    await db!.$disconnect()
  })
  const raw =
    'hostname switch\nntp server vrf Mgmt-intf 192.0.2.10\naaa group server tacacs+ ISE\n server-private 192.0.2.20 key 7 CONFIG_SECRET\n!\nend\n'
  function payload(at = '2026-10-13T03:00:00Z', raw_config = raw) {
    return {
      schema_version: 1 as const,
      run_id: crypto.randomUUID(),
      collected_at: at,
      complete: true as const,
      device: {
        site: prefix,
        hostname: prefix,
        management_ip: '192.0.2.1',
        device_type: 'cisco_ios',
        serial_number: prefix,
      },
      configuration: { platform: 'iosxe' as const, raw_config },
    }
  }
  async function post(body: ReturnType<typeof payload>, token = 'test-token') {
    const { legacyConfigPayloadSchema } = await import('../../src/lib/schemas/legacy-ingest')
    return handle(
      new Request('http://localhost/api/ingest/legacy/config', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      legacyConfigPayloadSchema,
      (parsed) => ingest(parsed, db! as never),
      'ingest.legacy.config',
      { token: 'test-token', audit: async () => {}, invalidateReads: () => {} },
    )
  }

  test('authenticated capture, replay, delayed delivery and failed output preserve the right latest snapshot', async () => {
    const first = payload()
    expect((await post(first, 'wrong')).status).toBe(401)
    const created = await post(first)
    expect(created.status).toBe(201)
    expect(await created.text()).not.toContain('CONFIG_SECRET')
    expect((await db!.inventoryConfig.findUniqueOrThrow({ where: { deviceId } })).rawConfig).toBe(
      raw,
    )
    const replay = await post(first)
    expect(replay.status).toBe(200)
    expect((await replay.json()).duplicate).toBe(true)
    expect(
      (
        await post({
          ...first,
          configuration: { ...first.configuration, raw_config: 'hostname changed' },
        })
      ).status,
    ).toBe(409)
    const delayed = await post(payload('2026-10-12T03:00:00Z', 'hostname delayed'))
    expect(delayed.status).toBe(201)
    expect((await delayed.json()).counts.updated).toBe(0)
    expect((await post(payload(first.collected_at, 'hostname same-time-conflict'))).status).toBe(
      409,
    )
    expect((await post(payload('2026-10-14T03:00:00Z', 'hostname switch\n--More--'))).status).toBe(
      422,
    )
    expect((await db!.inventoryConfig.findUniqueOrThrow({ where: { deviceId } })).rawConfig).toBe(
      raw,
    )
    const updatedRaw = `${raw}\nntp server 192.0.2.11\n`
    expect((await post(payload('2026-10-14T03:00:00Z', updatedRaw))).status).toBe(201)
    expect((await db!.inventoryConfig.findUniqueOrThrow({ where: { deviceId } })).rawConfig).toBe(
      updatedRaw,
    )
    expect(
      await db!.legacyIngestReceipt.count({ where: { deviceId: legacyId, feature: 'config' } }),
    ).toBe(3)
  })

  test('unlinked pushes can be retried after linking; a stack gets one shared config', async () => {
    await db!.inventorySource.delete({ where: { deviceId } })
    const capture = payload('2026-10-15T03:00:00Z')
    expect((await post(capture)).status).toBe(409)
    expect(
      await db!.legacyIngestReceipt.count({ where: { deviceId: legacyId, runId: capture.run_id } }),
    ).toBe(0)
    // Unlinking leaves the prior inventory-owned snapshot intact.
    expect(await db!.inventoryConfig.count({ where: { deviceId } })).toBe(1)
    const stack = await db!.deviceStack.create({ data: { name: `${prefix}-stack` } })
    await db!.inventorySource.create({
      data: {
        deviceStackId: stack.id,
        legacyDeviceId: legacyId,
        kind: 'LEGACY',
        sourceKey: `${prefix}|${prefix}`,
        sourceLabel: prefix,
        matchedOn: 'MANUAL_SELECTION',
      },
    })
    expect((await post(capture)).status).toBe(201)
    const shared = await db!.inventoryConfig.findUniqueOrThrow({
      where: { deviceStackId: stack.id },
    })
    expect(shared.rawConfig).toBe(raw)
    expect(shared.deviceId).toBeNull()
    expect(await db!.inventoryConfig.count({ where: { deviceStackId: stack.id } })).toBe(1)
  })

  test('concurrent deliveries cannot regress the shared stack snapshot', async () => {
    const replies = await Promise.all([
      post(payload('2026-10-16T03:00:00Z', 'hostname older-concurrent')),
      post(payload('2026-10-17T03:00:00Z', 'hostname newest-concurrent')),
    ])
    expect(replies.map((reply) => reply.status)).toEqual([201, 201])
    const owner = await db!.inventorySource.findUniqueOrThrow({
      where: { legacyDeviceId: legacyId },
    })
    expect(
      (
        await db!.inventoryConfig.findUniqueOrThrow({
          where: { deviceStackId: owner.deviceStackId! },
        })
      ).rawConfig,
    ).toBe('hostname newest-concurrent')
  })
})
