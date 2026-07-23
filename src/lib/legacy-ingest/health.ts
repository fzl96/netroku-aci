import { createHash } from 'crypto'
import type { LegacyHealthPayload } from '@/lib/schemas/legacy-ingest'
import {
  defaultLegacyDb,
  ingestLegacyFeature,
  type LegacyApplyContext,
  type LegacyIngestCounts,
  type LegacyIngestResult,
} from './common'

export async function applyLegacyHealth(
  context: LegacyApplyContext,
  payload: LegacyHealthPayload,
): Promise<LegacyIngestCounts> {
  const { tx, deviceId, receiptId, collectedAt } = context
  const health = payload.health
  await tx.legacyHealthSample.create({
    data: {
      deviceId,
      receiptId,
      collectedAt,
      uptime: health.uptime ?? '',
      cpuPercent: health.cpu_percent ?? null,
      memoryPercent: health.memory_percent ?? null,
      storagePercent: health.storage_percent ?? null,
      temperatureCelsius: health.temperature_celsius ?? null,
      fanStatuses: health.fan_statuses ?? [],
      psuStatuses: health.psu_statuses ?? [],
    },
  })

  const logRows = payload.logs.map(log => ({
    deviceId,
    receiptId,
    eventAt: log.timestamp ? new Date(log.timestamp) : null,
    severity: log.severity,
    message: log.message,
    raw: log.raw,
    eventHash: createHash('sha256')
      .update(log.timestamp
        ? `${deviceId}|${log.timestamp}|${log.raw}`
        : `${deviceId}|${log.raw}`)
      .digest('hex'),
    collectedAt,
  }))
  const insertedLogs = logRows.length > 0
    ? await tx.legacyLogEntry.createMany({ data: logRows, skipDuplicates: true })
    : { count: 0 }

  await tx.legacyDevice.update({
    where: { id: deviceId },
    data: { lastHealthSyncAt: collectedAt },
  })
  return {
    inserted: insertedLogs.count,
    updated: 0,
    cleared: 0,
    samples: 1,
  }
}

export function ingestLegacyHealth(
  payload: LegacyHealthPayload,
  db = defaultLegacyDb,
): Promise<LegacyIngestResult> {
  return ingestLegacyFeature(
    db,
    'health',
    payload,
    context => applyLegacyHealth(context, payload),
  )
}
