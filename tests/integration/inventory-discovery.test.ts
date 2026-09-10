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
    unstable_cache: (fn: unknown) => fn,
  }))
  mock.module('@/lib/auth', () => ({
    AuthenticationRequiredError: class extends Error {},
    requireAdmin: async () => ({
      id: 'integration-admin',
      userName: 'integration-admin',
      role: 'admin',
    }),
    requireSession: async () => ({
      id: 'integration-admin',
      userName: 'integration-admin',
      role: 'admin',
    }),
  }))
}
const db = enabled ? new PrismaClient({ datasourceUrl: url }) : null
const suite = enabled ? describe : describe.skip
suite('inventory discovery PostgreSQL integration (dedicated inventory_test database)', () => {
  let links: typeof import('../../src/lib/inventory/sources/mutation')
  let worker: typeof import('../../src/lib/inventory/sources/worker')
  let ingest: typeof import('../../src/lib/legacy-ingest/common')
  let imports: typeof import('../../src/lib/inventory/import/mutation')
  let csv: typeof import('../../src/lib/inventory/csv')
  let lease: typeof import('../../src/lib/apic/node-lease')
  async function reviewedLink(
    input: Omit<import('../../src/lib/inventory/sources/mutation').LinkInput, 'reviewToken'>,
  ) {
    const observations = await import('../../src/lib/inventory/sources/outbox')
    const observation =
      input.kind === 'ACI'
        ? observations.nodeObservation(
            await db!.nodeSnapshot.findUniqueOrThrow({ where: { id: input.sourceId } }),
          )
        : observations.legacyObservation(
            await db!.legacyDevice.findUniqueOrThrow({ where: { id: input.sourceId } }),
          )
    return links.linkInventorySource({
      ...input,
      reviewToken: observations.observationReviewToken(observation),
    })
  }
  let hostId: string
  const prefix = `it-${Date.now()}`
  beforeAll(async () => {
    links = await import('../../src/lib/inventory/sources/mutation')
    worker = await import('../../src/lib/inventory/sources/worker')
    ingest = await import('../../src/lib/legacy-ingest/common')
    imports = await import('../../src/lib/inventory/import/mutation')
    csv = await import('../../src/lib/inventory/csv')
    lease = await import('../../src/lib/apic/node-lease')
    const host = await db!.apicHost.create({ data: { name: prefix, host: `${prefix}.test` } })
    hostId = host.id
  })
  afterAll(async () => {
    await db?.$disconnect()
  })
  function payload(serial: string, version: string, at = '2026-09-09T01:00:00Z') {
    return {
      run_id: crypto.randomUUID(),
      collected_at: at,
      device: {
        site: prefix,
        hostname: `${prefix}-legacy`,
        management_ip: '192.0.2.5',
        device_type: 'ios',
        serial_number: serial,
        model: 'C9300',
        software_version: version,
      },
    }
  }
  const counts = async () => ({ inserted: 0, updated: 0, cleared: 0, samples: 0 })
  test('migration enforces target checks and keeps telemetry deletion independent of assets', async () => {
    await expect(
      Promise.resolve(
        db!.inventorySource.create({
          data: { kind: 'ACI', sourceKey: prefix, sourceLabel: prefix, matchedOn: 'SERIAL' },
        }),
      ),
    ).rejects.toThrow()
    const asset = await db!.device.create({
      data: {
        name: prefix,
        serialNumber: `${prefix}-aci`,
        model: 'N9K',
        vendor: 'Cisco',
        heightU: 2,
        assetTag: `${prefix}-tag`,
      },
    })
    const node = await db!.nodeSnapshot.create({
      data: {
        apicHostId: hostId,
        dn: 'topology/pod-1/node-1',
        nodeId: '1',
        name: 'leaf-1',
        model: 'N9K',
        serial: asset.serialNumber,
        version: 'v1',
      },
    })
    await reviewedLink({
      kind: 'ACI',
      sourceId: node.id,
      target: 'DEVICE',
      targetId: asset.id,
    })
    const accepted = await db!.device.findUniqueOrThrow({ where: { id: asset.id } })
    expect(accepted.name).toBe('leaf-1')
    expect(accepted.version).toBe('v1')
    expect(accepted.assetTag).toBe(asset.assetTag)
    await db!.nodeSnapshot.delete({ where: { id: node.id } })
    const source = await db!.inventorySource.findUniqueOrThrow({ where: { deviceId: asset.id } })
    expect(source.nodeSnapshotId).toBeNull()
    expect(source.sourceLabel).toContain('leaf-1')
    expect((await db!.device.findUniqueOrThrow({ where: { id: asset.id } })).version).toBe('v1')
    await expect(
      Promise.resolve(
        db!.inventorySource.create({
          data: {
            deviceId: asset.id,
            kind: 'LEGACY',
            sourceKey: prefix + 'bad',
            sourceLabel: prefix,
            matchedOn: 'SERIAL',
            serialAtLink: asset.serialNumber,
          },
        }),
      ),
    ).rejects.toThrow()
  })
  test('Legacy replay/delayed metadata does not regress source or inventory, CSV protects ownership', async () => {
    const first = payload(`${prefix}-legacy`, 'v1')
    const received = await ingest.ingestLegacyFeature(db! as never, 'health', first, counts)
    const asset = await db!.device.create({
      data: {
        name: 'old name',
        serialNumber: first.device.serial_number,
        model: 'old model',
        vendor: 'User vendor',
        heightU: 3,
        assetTag: `${prefix}-legacy-tag`,
      },
    })
    await reviewedLink({
      kind: 'LEGACY',
      sourceId: received.device_id,
      target: 'DEVICE',
      targetId: asset.id,
      singleChassis: true,
    })
    const upgrade = payload(first.device.serial_number, 'v2', '2026-09-09T02:00:00Z')
    await ingest.ingestLegacyFeature(db! as never, 'health', upgrade, counts)
    await ingest.ingestLegacyFeature(db! as never, 'health', first, counts)
    await ingest.ingestLegacyFeature(
      db! as never,
      'interfaces',
      payload(first.device.serial_number, 'old', '2026-09-09T00:00:00Z'),
      counts,
    )
    expect(
      (await db!.legacyDevice.findUniqueOrThrow({ where: { id: received.device_id } }))
        .softwareVersion,
    ).toBe('v2')
    await worker.drainInventoryJobs()
    const refreshed = await db!.device.findUniqueOrThrow({ where: { id: asset.id } })
    expect(refreshed.version).toBe('v2')
    expect(refreshed.vendor).toBe('User vendor')
    expect(refreshed.heightU).toBe(3)
    const parsed = csv.parseCsvRows(
      [{ serial: first.device.serial_number, asset_tag: `${prefix}-changed` }],
      ['serial', 'asset_tag'],
    )
    expect(csv.checkRequiredHeaders(['serial', 'asset_tag'])).toBeNull()
    await imports.commitDeviceImport(parsed.rows)
    expect((await db!.device.findUniqueOrThrow({ where: { id: asset.id } })).assetTag).toBe(
      `${prefix}-changed`,
    )
    const bad = csv.parseCsvRows(
      [{ serial: first.device.serial_number, hostname: 'clobber' }],
      ['serial', 'hostname'],
    )
    const preview = await imports.previewDeviceImport(bad.rows)
    expect(preview.canImport).toBe(false)
    expect(preview.rowStates[0].errors.join()).toContain('maintained by discovery')
    await ingest.ingestLegacyFeature(
      db! as never,
      'health',
      payload(`${prefix}-replacement`, 'v3', '2026-09-09T03:00:00Z'),
      counts,
    )
    await worker.drainInventoryJobs()
    const conflict = await db!.inventorySource.findUniqueOrThrow({ where: { deviceId: asset.id } })
    expect(conflict.conflictReason).toContain('Serial changed')
    expect((await db!.device.findUniqueOrThrow({ where: { id: asset.id } })).version).toBe('v2')
    expect(
      JSON.stringify(
        await (await import('../../src/lib/inventory/sources/query')).getWorkerHealth(),
      ),
    ).toContain('pending')
  })
  test('backed-off head blocks its successor, other sources progress, retry is durable', async () => {
    const observation = {
      name: 'test',
      model: 'N9K',
      serial: 'test',
      version: 'v1',
      managementIp: null,
      sourceLabel: prefix,
      seenAt: new Date().toISOString(),
      present: true,
      conflict: null,
    }
    const id = prefix + '-ordered'
    const first = await db!.inventoryReconcileJob.create({
      data: {
        kind: 'ACI',
        sourceKey: id,
        sourceRecordId: id,
        sourceRevision: 1,
        observation,
        availableAt: new Date(Date.now() + 600000),
        attempts: 1,
      },
    })
    const second = await db!.inventoryReconcileJob.create({
      data: { kind: 'ACI', sourceKey: id, sourceRecordId: id, sourceRevision: 2, observation },
    })
    const other = await db!.inventoryReconcileJob.create({
      data: {
        kind: 'ACI',
        sourceKey: id + 'other',
        sourceRecordId: id + 'other',
        sourceRevision: 1,
        observation,
      },
    })
    await Promise.all([worker.drainInventoryJobs(5), worker.drainInventoryJobs(5)])
    expect(
      (await db!.inventoryReconcileJob.findUniqueOrThrow({ where: { id: second.id } })).completedAt,
    ).toBeNull()
    expect(
      (await db!.inventoryReconcileJob.findUniqueOrThrow({ where: { id: other.id } })).completedAt,
    ).not.toBeNull()
    await db!.inventoryReconcileJob.update({
      where: { id: first.id },
      data: { availableAt: new Date(0) },
    })
    await worker.drainInventoryJobs()
    expect(
      (await db!.inventoryReconcileJob.findUniqueOrThrow({ where: { id: second.id } })).completedAt,
    ).not.toBeNull()
  })
  test('logical stack preserves per-member identities and blocks removal of last linked member', async () => {
    const stackSource = {
      ...payload(`${prefix}-master`, 'stack-v1'),
      device: { ...payload(`${prefix}-master`, 'stack-v1').device, hostname: `${prefix}-stack` },
    }
    const received = await ingest.ingestLegacyFeature(db! as never, 'health', stackSource, counts)
    const members = await Promise.all(
      [1, 2, 3].map((i) =>
        db!.device.create({
          data: {
            name: `member-${i}`,
            serialNumber: `${prefix}-member-${i}`,
            vendor: 'Cisco',
            model: `model-${i}`,
            heightU: i,
          },
        }),
      ),
    )
    const result = await reviewedLink({
      kind: 'LEGACY',
      sourceId: received.device_id,
      target: 'STACK',
      stackName: `${prefix}-stack`,
      memberIds: members.map((m) => m.id),
    })
    expect(result.stackId).toBeTruthy()
    await ingest.ingestLegacyFeature(
      db! as never,
      'health',
      {
        ...stackSource,
        run_id: crypto.randomUUID(),
        collected_at: '2026-09-09T04:00:00Z',
        device: {
          ...stackSource.device,
          serial_number: `${prefix}-other-master`,
          software_version: 'stack-v2',
        },
      },
      counts,
    )
    await worker.drainInventoryJobs()
    const stack = await db!.deviceStack.findUniqueOrThrow({
      where: { id: result.stackId! },
      include: { devices: true },
    })
    expect(stack.observedVersion).toBe('stack-v2')
    expect(stack.devices.map((d) => d.serialNumber).sort()).toEqual(
      members.map((d) => d.serialNumber).sort(),
    )
    expect(stack.devices.every((d) => d.version === null)).toBe(true)
    const mutation = await import('../../src/lib/inventory/devices/mutation')
    await mutation.deleteDeviceRecord(members[0].id)
    await mutation.deleteDeviceRecord(members[1].id)
    await expect(mutation.deleteDeviceRecord(members[2].id)).rejects.toThrow('Unlink the stack')
  })
  test('fenced host lease rejects overlapping or superseded runs', async () => {
    const token = await lease.acquireNodeLease(hostId)
    await expect(lease.acquireNodeLease(hostId)).rejects.toThrow('already running')
    await db!.$transaction((tx) => lease.verifyNodeLease(tx, hostId, token))
    await db!.apicHost.update({ where: { id: hostId }, data: { nodeLeaseExpiresAt: new Date(0) } })
    const newer = await lease.acquireNodeLease(hostId)
    await expect(
      db!.$transaction((tx) => lease.verifyNodeLease(tx, hostId, token)),
    ).rejects.toThrow('expired or was replaced')
    await lease.releaseNodeLease(hostId, token)
    expect((await db!.apicHost.findUniqueOrThrow({ where: { id: hostId } })).nodeLeaseToken).toBe(
      newer,
    )
    await lease.releaseNodeLease(hostId, newer)
  })
  test('concurrent adoption creates one asset and rejects an outdated review', async () => {
    const node = await db!.nodeSnapshot.create({
      data: {
        apicHostId: hostId,
        dn: prefix + '-race',
        nodeId: 'race',
        name: 'race-node',
        serial: prefix + '-race',
        model: 'N9K',
        version: 'v1',
      },
    })
    const observations = await import('../../src/lib/inventory/sources/outbox')
    const input = {
      kind: 'ACI' as const,
      sourceId: node.id,
      target: 'DEVICE' as const,
      reviewToken: observations.observationReviewToken(observations.nodeObservation(node)),
      device: {
        name: node.name,
        serialNumber: node.serial,
        model: node.model,
        vendor: 'Cisco',
        heightU: 1,
      },
    }
    await db!.nodeSnapshot.update({ where: { id: node.id }, data: { version: 'v2' } })
    await expect(links.linkInventorySource(input)).rejects.toThrow('changed since review')
    const updated = await db!.nodeSnapshot.findUniqueOrThrow({ where: { id: node.id } })
    input.reviewToken = observations.observationReviewToken(observations.nodeObservation(updated))
    const outcomes = await Promise.allSettled([
      links.linkInventorySource(input),
      links.linkInventorySource(input),
    ])
    expect(outcomes.filter((o) => o.status === 'fulfilled').length).toBe(1)
    expect(await db!.device.count({ where: { serialNumber: node.serial } })).toBe(1)
  })
  test('inventory audit failure rolls back application, not committed telemetry, and can retry', async () => {
    const outbox = await import('../../src/lib/inventory/sources/outbox')
    const node = await db!.nodeSnapshot.create({
      data: {
        apicHostId: hostId,
        dn: prefix + '-failure',
        nodeId: 'failure',
        name: 'failure-node',
        serial: prefix + '-failure',
        model: 'N9K',
        version: 'v1',
      },
    })
    const linked = await reviewedLink({
      kind: 'ACI',
      sourceId: node.id,
      target: 'DEVICE',
      device: {
        name: node.name,
        serialNumber: node.serial,
        model: node.model,
        vendor: 'User vendor',
        heightU: 2,
      },
    })
    await db!.$transaction(async (tx) => {
      const before = await tx.nodeSnapshot.findMany({ where: { apicHostId: hostId } })
      await tx.nodeSnapshot.update({ where: { id: node.id }, data: { version: 'v2' } })
      await outbox.enqueueNodeChanges(tx, before, hostId)
    })
    await db!.$executeRawUnsafe(
      `ALTER TABLE audit_log ADD CONSTRAINT inventory_test_audit_failure CHECK (action <> 'inventory.reconcile') NOT VALID`,
    )
    try {
      const result = await worker.drainInventoryJobs()
      expect(result.failed).toBeGreaterThan(0)
      expect((await db!.nodeSnapshot.findUniqueOrThrow({ where: { id: node.id } })).version).toBe(
        'v2',
      )
      expect(
        (await db!.device.findUniqueOrThrow({ where: { id: linked.deviceId! } })).version,
      ).toBe('v1')
      const job = await db!.inventoryReconcileJob.findFirstOrThrow({
        where: { sourceRecordId: node.id },
      })
      expect(job.completedAt).toBeNull()
      expect(job.attempts).toBe(1)
    } finally {
      await db!.$executeRawUnsafe(
        'ALTER TABLE audit_log DROP CONSTRAINT inventory_test_audit_failure',
      )
    }
    await db!.inventoryReconcileJob.updateMany({
      where: { sourceRecordId: node.id, completedAt: null },
      data: { availableAt: new Date(0) },
    })
    await worker.drainInventoryJobs()
    expect((await db!.device.findUniqueOrThrow({ where: { id: linked.deviceId! } })).version).toBe(
      'v2',
    )
    // A missing serial must not erase an unresolved replacement conflict.
    for (const serial of ['replacement-serial', '']) {
      await db!.$transaction(async (tx) => {
        const before = await tx.nodeSnapshot.findMany({ where: { apicHostId: hostId } })
        await tx.nodeSnapshot.update({ where: { id: node.id }, data: { serial, version: 'v3' } })
        await outbox.enqueueNodeChanges(tx, before, hostId)
      })
      await worker.drainInventoryJobs()
    }
    expect(
      (await db!.inventorySource.findUniqueOrThrow({ where: { deviceId: linked.deviceId! } }))
        .conflictReason,
    ).toContain('Serial changed')
    expect((await db!.device.findUniqueOrThrow({ where: { id: linked.deviceId! } })).version).toBe(
      'v2',
    )
  })
  test('worker health distinguishes no configuration, no caller, stale heartbeat and healthy empty drain', async () => {
    const { getWorkerHealth } = await import('../../src/lib/inventory/sources/query')
    const saved = process.env.SCHEDULER_TOKEN
    try {
      delete process.env.SCHEDULER_TOKEN
      expect((await getWorkerHealth()).state).toBe('Worker not configured')
      process.env.SCHEDULER_TOKEN = 'test-token'
      await db!.inventoryWorkerHealth.deleteMany()
      expect((await getWorkerHealth()).state).toBe('Worker not observed')
      await db!.inventoryWorkerHealth.create({
        data: { id: 'inventory', lastCompletedAt: new Date(0) },
      })
      expect((await getWorkerHealth()).state).toBe('Worker heartbeat overdue')
      await worker.drainInventoryJobs()
      expect((await getWorkerHealth()).lastCompletedAt).not.toBeNull()
      expect((await getWorkerHealth()).state).toBe('Worker healthy')
    } finally {
      if (saved === undefined) delete process.env.SCHEDULER_TOKEN
      else process.env.SCHEDULER_TOKEN = saved
    }
  })
  test('discovery reads are serializable and a recreated source retains an explicit relink path', async () => {
    const { getDiscoveredDevices } = await import('../../src/lib/inventory/sources/query')
    const node = await db!.nodeSnapshot.create({
      data: {
        apicHostId: hostId,
        dn: prefix + '-recreated',
        nodeId: 'recreated',
        name: prefix + '-recreated',
        serial: prefix + '-recreated',
        model: 'N9K',
      },
    })
    const asset = await reviewedLink({
      kind: 'ACI',
      sourceId: node.id,
      target: 'DEVICE',
      device: {
        name: node.name,
        serialNumber: node.serial,
        model: node.model,
        vendor: 'Cisco',
        heightU: 1,
      },
    })
    const previous = await db!.inventorySource.findUniqueOrThrow({
      where: { deviceId: asset.deviceId! },
    })
    await db!.nodeSnapshot.delete({ where: { id: node.id } })
    const replacement = await db!.nodeSnapshot.create({
      data: {
        apicHostId: hostId,
        dn: node.dn,
        nodeId: node.nodeId,
        name: node.name,
        serial: node.serial,
        model: node.model,
      },
    })
    const view = await getDiscoveredDevices({ kind: 'ACI', q: prefix + '-recreated' })
    expect(view.rows[0].link?.id).toBe(previous.id)
    expect(view.rows[0].matchCount).toBe(1)
    expect(JSON.stringify(view)).not.toContain('acceptedRevision')
    await reviewedLink({
      kind: 'ACI',
      sourceId: replacement.id,
      target: 'DEVICE',
      targetId: asset.deviceId!,
      replaceSourceId: previous.id,
    })
    expect(
      (await db!.inventorySource.findUniqueOrThrow({ where: { deviceId: asset.deviceId! } }))
        .nodeSnapshotId,
    ).toBe(replacement.id)
  })
  test('authenticated tick drains inventory with no APIC schedules', async () => {
    const { POST } = await import('../../src/app/api/cron/tick/route')
    const saved = process.env.SCHEDULER_TOKEN
    try {
      delete process.env.SCHEDULER_TOKEN
      expect(
        (await POST(new Request('http://localhost/api/cron/tick', { method: 'POST' }))).status,
      ).toBe(503)
      process.env.SCHEDULER_TOKEN = 'integration-tick'
      expect(
        (await POST(new Request('http://localhost/api/cron/tick', { method: 'POST' }))).status,
      ).toBe(401)
      const response = await POST(
        new Request('http://localhost/api/cron/tick', {
          method: 'POST',
          headers: { authorization: 'Bearer integration-tick' },
        }),
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.ran).toBe(0)
      expect(body.inventory).toEqual({ completed: 0, failed: 0 })
      expect(
        (await db!.inventoryWorkerHealth.findUniqueOrThrow({ where: { id: 'inventory' } }))
          .lastCompletedAt,
      ).not.toBeNull()
    } finally {
      if (saved === undefined) delete process.env.SCHEDULER_TOKEN
      else process.env.SCHEDULER_TOKEN = saved
    }
  })
  test('500-node resync persists a bounded outbox within the telemetry transaction budget', async () => {
    const { executeNodeResyncWrites } = await import('../../src/lib/apic/nodes')
    const { enqueueNodeChanges } = await import('../../src/lib/inventory/sources/outbox')
    const host = await db!.apicHost.create({
      data: { name: prefix + '-fabric', host: prefix + '-fabric.test' },
    })
    const nodes = Array.from({ length: 500 }, (_, i) => ({
      dn: `topology/pod-1/node-${i + 1}`,
      nodeId: String(i + 1),
      name: `leaf-${i + 1}`,
      role: 'leaf',
      model: 'N9K',
      serial: `${prefix}-fabric-${i + 1}`,
      version: 'v1',
      fabricSt: 'active',
      state: 'in-service',
      podId: '1',
      uptime: null,
      oobMgmtAddr: null,
    }))
    const token = await lease.acquireNodeLease(host.id)
    const started = performance.now()
    try {
      const summary = await executeNodeResyncWrites(db!, host.id, nodes, [], new Date(), {
        before: (tx) => lease.verifyNodeLease(tx, host.id, token),
        after: (tx) => enqueueNodeChanges(tx, [], host.id),
      })
      expect(summary.nodesTotal).toBe(500)
      const rows = await db!.nodeSnapshot.findMany({
        where: { apicHostId: host.id },
        select: { id: true },
      })
      expect(
        await db!.inventoryReconcileJob.count({
          where: { sourceRecordId: { in: rows.map((row) => row.id) } },
        }),
      ).toBe(500)
      console.info(
        `500-node resync with outbox: ${Math.round(performance.now() - started)}ms (30,000ms transaction budget)`,
      )
      await db!.inventoryReconcileJob.deleteMany({
        where: { sourceRecordId: { in: rows.map((row) => row.id) } },
      })
    } finally {
      await lease.releaseNodeLease(host.id, token)
      await db!.apicHost.delete({ where: { id: host.id } })
    }
  }, 35000)
})
