import type { LegacyInterfacePayload } from '@/lib/schemas/legacy-ingest'
import {
  defaultLegacyDb,
  ingestLegacyFeature,
  normalizeLegacyKey,
  type LegacyApplyContext,
  type LegacyIngestCounts,
  type LegacyIngestResult,
} from './common'

export function computeLegacyDelta(
  current: bigint,
  previous: bigint | null,
): bigint | null {
  if (previous === null || current < previous) return null
  return current - previous
}

export async function applyLegacyInterfaces(
  context: LegacyApplyContext,
  payload: LegacyInterfacePayload,
): Promise<LegacyIngestCounts> {
  const { tx, deviceId, receiptId, collectedAt } = context
  const deduped = new Map<string, LegacyInterfacePayload['interfaces'][number]>()
  for (const row of payload.interfaces) {
    deduped.set(normalizeLegacyKey(row.name), row)
  }
  const rows = Array.from(deduped, ([ifNameKey, row]) => ({ ifNameKey, row }))

  const existingRows = await tx.legacyInterfaceSnapshot.findMany({
    where: { deviceId },
    select: { id: true, ifNameKey: true },
  })
  const existingKeys = new Set(existingRows.map((row: { ifNameKey: string }) => row.ifNameKey))
  let inserted = 0
  let updated = 0

  for (const { ifNameKey, row } of rows) {
    if (existingKeys.has(ifNameKey)) updated += 1
    else inserted += 1
    const snapshot = await tx.legacyInterfaceSnapshot.upsert({
      where: { deviceId_ifNameKey: { deviceId, ifNameKey } },
      update: {
        ifName: row.name.trim(),
        description: row.description,
        ipAddress: row.ip_address,
        prefixLength: row.prefix_length,
        mtu: row.mtu,
        speed: row.speed,
        adminSt: row.admin_state,
        operSt: row.oper_state,
        present: true,
        lastSeenAt: collectedAt,
      },
      create: {
        deviceId,
        ifName: row.name.trim(),
        ifNameKey,
        description: row.description,
        ipAddress: row.ip_address,
        prefixLength: row.prefix_length,
        mtu: row.mtu,
        speed: row.speed,
        adminSt: row.admin_state,
        operSt: row.oper_state,
        present: true,
        firstSeenAt: collectedAt,
        lastSeenAt: collectedAt,
      },
      select: { id: true, ifNameKey: true },
    })
    const previous = await tx.legacyInterfaceSample.findFirst({
      where: { interfaceId: snapshot.id },
      orderBy: { collectedAt: 'desc' },
      select: { inputErrors: true, outputErrors: true, crcErrors: true },
    })
    const inputErrors = BigInt(row.input_errors)
    const outputErrors = BigInt(row.output_errors)
    const crcErrors = BigInt(row.crc_errors)
    await tx.legacyInterfaceSample.create({
      data: {
        deviceId,
        interfaceId: snapshot.id,
        receiptId,
        collectedAt,
        adminSt: row.admin_state,
        operSt: row.oper_state,
        speed: row.speed,
        inputErrors,
        outputErrors,
        crcErrors,
        dInputErrors: computeLegacyDelta(inputErrors, previous?.inputErrors ?? null),
        dOutputErrors: computeLegacyDelta(outputErrors, previous?.outputErrors ?? null),
        dCrcErrors: computeLegacyDelta(crcErrors, previous?.crcErrors ?? null),
      },
    })
  }

  const presentWhere: Record<string, unknown> = { deviceId, present: true }
  if (rows.length > 0) {
    presentWhere.ifNameKey = { notIn: rows.map(item => item.ifNameKey) }
  }
  const cleared = await tx.legacyInterfaceSnapshot.updateMany({
    where: presentWhere,
    data: { present: false },
  })
  await tx.legacyDevice.update({
    where: { id: deviceId },
    data: { lastInterfaceSyncAt: collectedAt },
  })
  return { inserted, updated, cleared: cleared.count, samples: rows.length }
}

export function ingestLegacyInterfaces(
  payload: LegacyInterfacePayload,
  db = defaultLegacyDb,
): Promise<LegacyIngestResult> {
  return ingestLegacyFeature(
    db,
    'interfaces',
    payload,
    context => applyLegacyInterfaces(context, payload),
  )
}
