import { createHash } from 'node:crypto'
import type { LegacyDevice, NodeSnapshot, Prisma } from '@prisma/client'
import { sourceKey, type Observation } from './identity'

export function nodeObservation(n: NodeSnapshot): Observation {
  return {
    name: n.name,
    serial: n.serial,
    model: n.model,
    version: n.version,
    managementIp: n.oobMgmtAddr,
    sourceLabel: `${n.name || n.nodeId} @ ACI ${n.apicHostId}`,
    seenAt: n.lastSeenAt.toISOString(),
    present: n.present,
    conflict: null,
  }
}
export function legacyObservation(n: LegacyDevice): Observation {
  return {
    name: n.hostname,
    serial: n.serialNumber,
    model: n.model,
    version: n.softwareVersion,
    managementIp: n.managementIp,
    sourceLabel: `${n.hostname} @ Legacy ${n.site}`,
    seenAt: n.lastSeenAt.toISOString(),
    present: true,
    conflict: n.inventoryMetadataConflict,
  }
}
function changed(a: Observation | null, b: Observation) {
  if (!a) return true
  return Object.keys(a).some(
    (key) => key !== 'seenAt' && a[key as keyof Observation] !== b[key as keyof Observation],
  )
}
export async function enqueueNodeChanges(
  tx: Prisma.TransactionClient,
  before: NodeSnapshot[],
  hostId: string,
) {
  const previous = new Map(before.map((n) => [n.id, n]))
  const after = await tx.nodeSnapshot.findMany({ where: { apicHostId: hostId } })
  const jobs: Prisma.InventoryReconcileJobCreateManyInput[] = []
  for (const n of after) {
    const old = previous.get(n.id)
    const observation = nodeObservation(n)
    if (!changed(old ? nodeObservation(old) : null, observation)) continue
    const row = await tx.nodeSnapshot.update({
      where: { id: n.id },
      data: { inventoryRevision: { increment: 1 } },
    })
    jobs.push({
      id: crypto.randomUUID(),
      kind: 'ACI',
      sourceKey: sourceKey(n.apicHostId, n.dn),
      sourceRecordId: n.id,
      sourceRevision: row.inventoryRevision,
      observation,
    })
  }
  if (jobs.length) await tx.inventoryReconcileJob.createMany({ data: jobs })
}
export async function enqueueLegacyChange(
  tx: Prisma.TransactionClient,
  before: LegacyDevice | null,
  after: LegacyDevice,
) {
  const observation = legacyObservation(after)
  if (!changed(before ? legacyObservation(before) : null, observation)) return
  const row = await tx.legacyDevice.update({
    where: { id: after.id },
    data: { inventoryRevision: { increment: 1 } },
  })
  await tx.inventoryReconcileJob.create({
    data: {
      kind: 'LEGACY',
      sourceKey: sourceKey(after.siteKey, after.hostnameKey),
      sourceRecordId: after.id,
      sourceRevision: row.inventoryRevision,
      observation,
    },
  })
}

type Clock = Record<string, { at: string; conflict?: boolean }>
export function orderedMetadata(
  current: Record<string, unknown>,
  incoming: Record<string, string>,
  rawClock: unknown,
  at: string,
) {
  const clock = { ...((rawClock as Clock) ?? {}) }
  const data: Record<string, string> = {}
  for (const [key, value] of Object.entries(incoming)) {
    if (!value.trim()) continue
    const previous = clock[key]
    if (previous && at < previous.at) continue
    if (previous?.at === at) {
      if (value !== current[key]) clock[key] = { ...previous, conflict: true }
      continue
    }
    data[key] = value
    clock[key] = { at }
  }
  const conflicts = Object.entries(clock)
    .filter(([, v]) => v.conflict)
    .map(([key]) => key)
  return {
    data,
    clock,
    conflict: conflicts.length
      ? `Conflicting observations at the same collection time: ${conflicts.join(', ')}`
      : null,
  }
}

/** Review tokens exclude receipt freshness: only material source changes require re-review. */
export function observationReviewToken(observation: Observation): string {
  return createHash('sha256')
    .update(JSON.stringify({ ...observation, seenAt: undefined }))
    .digest('hex')
}
