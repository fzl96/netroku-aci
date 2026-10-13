import type { LegacyConfigPayload } from '@/lib/schemas/legacy-ingest'
import { lockInventory } from '@/lib/inventory/sources/locking'
import { serialKey } from '@/lib/inventory/sources/identity'
import {
  ConfigIngestConflictError,
  defaultLegacyDb,
  ingestLegacyFeature,
  type LegacyApplyContext,
  type LegacyIngestCounts,
  type LegacyIngestResult,
} from './common'

export async function applyLegacyConfig(
  { tx, deviceId, collectedAt }: LegacyApplyContext,
  payload: LegacyConfigPayload,
): Promise<LegacyIngestCounts> {
  // ingestLegacyFeature has locked the legacy source first, matching adoption's order.
  // Serializing with asset/link writers prevents an unlink/relink racing this write.
  await lockInventory(tx)
  const source = await tx.inventorySource.findUnique({
    where: { legacyDeviceId: deviceId },
    select: {
      kind: true,
      deviceId: true,
      deviceStackId: true,
      serialAtLink: true,
      conflictReason: true,
      device: { select: { deviceStackId: true } },
    },
  })
  if (!source || source.kind !== 'LEGACY' || (!source.deviceId && !source.deviceStackId)) {
    throw new ConfigIngestConflictError(
      'Link this legacy device to an inventory device or stack through Discovered devices before pushing its configuration',
    )
  }
  if (source.conflictReason) {
    throw new ConfigIngestConflictError(
      'Resolve the inventory discovery conflict before pushing this configuration',
    )
  }
  if (source.device?.deviceStackId) {
    throw new ConfigIngestConflictError(
      'Link this legacy discovery to the whole inventory stack before pushing its shared configuration',
    )
  }
  if (
    source.deviceId &&
    payload.device.serial_number &&
    source.serialAtLink &&
    serialKey(payload.device.serial_number) !== serialKey(source.serialAtLink)
  ) {
    throw new ConfigIngestConflictError(
      'The collected device serial no longer matches the inventory link; review the link before pushing configuration',
    )
  }
  const owner = source.deviceId
    ? { deviceId: source.deviceId }
    : { deviceStackId: source.deviceStackId! }
  const existing = await tx.inventoryConfig.findUnique({ where: owner })
  const counts = { inserted: 0, updated: 0, cleared: 0, samples: 0 }
  if (existing && collectedAt < existing.collectedAt) return counts
  const { raw_config: rawConfig, platform } = payload.configuration
  if (existing && collectedAt.getTime() === existing.collectedAt.getTime()) {
    if (existing.rawConfig !== rawConfig || existing.platform !== platform) {
      throw new ConfigIngestConflictError(
        'Different configurations have the same collection timestamp; collect a new configuration',
      )
    }
    return counts
  }
  await tx.inventoryConfig.upsert({
    where: owner,
    create: { ...owner, rawConfig, platform, collectedAt },
    update: { rawConfig, platform, collectedAt },
  })
  return { ...counts, inserted: existing ? 0 : 1, updated: existing ? 1 : 0 }
}

export function ingestLegacyConfig(
  payload: LegacyConfigPayload,
  db = defaultLegacyDb,
): Promise<LegacyIngestResult> {
  return ingestLegacyFeature(db, 'config', payload, (context) =>
    applyLegacyConfig(context, payload),
  )
}
