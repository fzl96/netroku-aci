import { revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import type { InventoryReconcileJob, Prisma } from '@prisma/client'
import { observationSchema, serialKey, technicalPatch } from './identity'
import { lockInventory } from './locking'
import { invalidateInventoryReads } from '@/lib/inventory/mutation'

export async function applyJob(tx: Prisma.TransactionClient, job: InventoryReconcileJob) {
  const observation = observationSchema.parse(job.observation)
  await lockInventory(tx)
  const source = await tx.inventorySource.findFirst({
    where:
      job.kind === 'ACI'
        ? { nodeSnapshotId: job.sourceRecordId }
        : { legacyDeviceId: job.sourceRecordId },
    include: { device: true, deviceStack: true },
  })
  if (source && source.acceptedRevision < job.sourceRevision) {
    let conflict = observation.conflict
    let didChange = false
    if (source.device) {
      const serial = serialKey(observation.serial)
      if (!serial && source.conflictReason) conflict = source.conflictReason
      if (
        (serial && serial !== serialKey(source.serialAtLink)) ||
        serialKey(source.device.serialNumber) !== serialKey(source.serialAtLink)
      ) {
        conflict = `Serial changed from ${source.serialAtLink} to ${observation.serial ?? 'unknown'}. Review replacement hardware.`
      }
      if (!conflict && observation.present) {
        const patch = technicalPatch(source.device, observation)
        didChange = Object.keys(patch).length > 0
        if (didChange) await tx.device.update({ where: { id: source.device.id }, data: patch })
      }
    } else if (source.deviceStack && !conflict && observation.present) {
      const patch = {
        observedHostname: observation.name || source.deviceStack.observedHostname,
        observedVersion: observation.version || source.deviceStack.observedVersion,
        observedManagementIp: observation.managementIp || source.deviceStack.observedManagementIp,
      }
      didChange = Object.entries(patch).some(
        ([key, value]) => source.deviceStack![key as keyof typeof patch] !== value,
      )
      if (didChange)
        await tx.deviceStack.update({ where: { id: source.deviceStack.id }, data: patch })
    }
    await tx.inventorySource.update({
      where: { id: source.id },
      data: {
        acceptedRevision: job.sourceRevision,
        conflictReason: conflict,
        sourceLabel: observation.sourceLabel,
        lastSeenAt: new Date(observation.seenAt),
        ...(!conflict && observation.present
          ? { lastAppliedAt: new Date(), lastAppliedObservationAt: new Date(observation.seenAt) }
          : {}),
      },
    })
    if (didChange || conflict !== source.conflictReason) {
      await tx.auditLog.create({
        data: {
          userName: 'inventory-worker',
          action: 'inventory.reconcile',
          target: source.sourceLabel,
          status: conflict ? 'failure' : 'success',
          detail: conflict ?? 'Accepted discovered technical values',
        },
      })
    }
  }
  await tx.inventoryReconcileJob.update({
    where: { id: job.id },
    data: { completedAt: new Date(), lastError: null },
  })
}
export async function drainInventoryJobs(limit = 40) {
  const started = Date.now()
  await prisma.inventoryWorkerHealth.upsert({
    where: { id: 'inventory' },
    create: { id: 'inventory', lastStartedAt: new Date() },
    update: { lastStartedAt: new Date() },
  })
  let completed = 0
  let failed = 0
  for (let i = 0; i < limit && Date.now() - started < 8000; i++) {
    let claimedId: string | null = null
    try {
      const ran = await prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<InventoryReconcileJob[]>`
          SELECT j.* FROM inventory_reconcile_job j
          WHERE j."completedAt" IS NULL AND j."availableAt" <= (now() AT TIME ZONE 'UTC')
          AND NOT EXISTS (SELECT 1 FROM inventory_reconcile_job e
            WHERE e.kind = j.kind AND e."sourceRecordId" = j."sourceRecordId"
            AND e."sourceRevision" < j."sourceRevision" AND e."completedAt" IS NULL)
          ORDER BY j."availableAt", j."createdAt", j.id
          LIMIT 1 FOR UPDATE OF j SKIP LOCKED`
          if (!rows[0]) return false
          claimedId = rows[0].id
          await applyJob(tx, rows[0])
          return true
        },
        { timeout: 5000 },
      )
      if (!ran) break
      completed++
    } catch (error) {
      failed++
      console.error('[inventory-worker] reconciliation failed', claimedId, error)
      if (claimedId) {
        const job = await prisma.inventoryReconcileJob.findUnique({ where: { id: claimedId } })
        if (job)
          await prisma.inventoryReconcileJob.updateMany({
            where: { id: claimedId, completedAt: null },
            data: {
              attempts: { increment: 1 },
              lastError: 'Reconciliation failed; inspect server logs and retry.',
              availableAt: new Date(
                Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(job.attempts, 7)),
              ),
            },
          })
      } else break
    }
  }
  const now = new Date()
  await prisma.inventoryWorkerHealth.update({
    where: { id: 'inventory' },
    data: {
      lastCompletedAt: now,
      ...(failed
        ? {
            lastErrorAt: now,
            lastError: `${failed} reconciliation job(s) failed; inspect server logs.`,
          }
        : { lastSucceededAt: now, lastError: null }),
    },
  })
  const configuredDays = Number(process.env.INVENTORY_JOB_RETENTION_DAYS)
  const days =
    Number.isFinite(configuredDays) && configuredDays > 0 ? Math.min(365, configuredDays) : 7
  await prisma.$executeRaw`DELETE FROM inventory_reconcile_job WHERE id IN
    (SELECT id FROM inventory_reconcile_job WHERE "completedAt" < ${new Date(Date.now() - days * 86400000)} LIMIT 1000)`
  if (completed) {
    invalidateInventoryReads()
    revalidateTag('history:all', { expire: 0 })
  }
  return { completed, failed }
}
