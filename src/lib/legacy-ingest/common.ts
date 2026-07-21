import { createHash } from 'crypto'
import { Prisma, type LegacyIngestFeature } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export interface LegacyIngestCounts {
  inserted: number
  updated: number
  cleared: number
  samples: number
}

export interface LegacyIngestResult {
  receipt_id: string
  duplicate: boolean
  device_id: string
  counts: LegacyIngestCounts
}

interface LegacyBasePayload {
  run_id: string
  collected_at: string
  device: {
    site: string
    hostname: string
    management_ip: string
    device_type: string
    vendor?: string
    model?: string
    serial_number?: string
    software_version?: string
    location?: string
  }
}

export interface LegacyApplyContext {
  tx: any
  deviceId: string
  receiptId: string
  collectedAt: Date
}

type ApplyLegacyFeature = (
  context: LegacyApplyContext,
) => Promise<LegacyIngestCounts>

interface LegacyDb {
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>
  legacyDevice?: any
  legacyIngestReceipt?: any
}

export class IdempotencyConflictError extends Error {
  constructor() {
    super('Idempotency key was already used with different content')
    this.name = 'IdempotencyConflictError'
  }
}

export function normalizeLegacyKey(value: string): string {
  return value.normalize('NFC').trim().toLocaleLowerCase('en-US')
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const input = value as Record<string, unknown>
    const output: Record<string, unknown> = {}
    for (const key of Object.keys(input).sort()) output[key] = canonicalize(input[key])
    return output
  }
  return value
}

export function canonicalPayloadHash(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(payload)))
    .digest('hex')
}

function receiptResult(
  receipt: any,
  deviceId: string,
  duplicate: boolean,
): LegacyIngestResult {
  return {
    receipt_id: receipt.id,
    duplicate,
    device_id: deviceId,
    counts: {
      inserted: receipt.inserted,
      updated: receipt.updated,
      cleared: receipt.cleared,
      samples: receipt.samples,
    },
  }
}

function metadataFor(payload: LegacyBasePayload): Record<string, string> {
  const result: Record<string, string> = {}
  const mappings = {
    vendor: payload.device.vendor,
    model: payload.device.model,
    serialNumber: payload.device.serial_number,
    softwareVersion: payload.device.software_version,
    location: payload.device.location,
  }
  for (const [key, value] of Object.entries(mappings)) {
    if (value !== undefined) result[key] = value
  }
  return result
}

async function readRacedReceipt(
  db: LegacyDb,
  feature: LegacyIngestFeature,
  payload: LegacyBasePayload,
  payloadHash: string,
): Promise<LegacyIngestResult | null> {
  if (!db.legacyDevice || !db.legacyIngestReceipt) return null
  const device = await db.legacyDevice.findUnique({
    where: {
      siteKey_hostnameKey: {
        siteKey: normalizeLegacyKey(payload.device.site),
        hostnameKey: normalizeLegacyKey(payload.device.hostname),
      },
    },
    select: { id: true },
  })
  if (!device) return null
  const receipt = await db.legacyIngestReceipt.findUnique({
    where: {
      runId_deviceId_feature: {
        runId: payload.run_id,
        deviceId: device.id,
        feature,
      },
    },
  })
  if (!receipt) return null
  if (receipt.payloadHash !== payloadHash) throw new IdempotencyConflictError()
  return receiptResult(receipt, device.id, true)
}

export async function ingestLegacyFeature(
  db: LegacyDb,
  feature: LegacyIngestFeature,
  payload: LegacyBasePayload,
  apply: ApplyLegacyFeature,
): Promise<LegacyIngestResult> {
  const payloadHash = canonicalPayloadHash(payload)
  const collectedAt = new Date(payload.collected_at)
  const site = payload.device.site.trim()
  const hostname = payload.device.hostname.trim()
  const siteKey = normalizeLegacyKey(site)
  const hostnameKey = normalizeLegacyKey(hostname)
  const metadata = metadataFor(payload)

  try {
    return await db.$transaction(async tx => {
      const device = await tx.legacyDevice.upsert({
        where: { siteKey_hostnameKey: { siteKey, hostnameKey } },
        update: {
          site,
          hostname,
          managementIp: payload.device.management_ip,
          deviceType: payload.device.device_type,
          active: true,
          lastSeenAt: new Date(),
          ...metadata,
        },
        create: {
          site,
          siteKey,
          hostname,
          hostnameKey,
          managementIp: payload.device.management_ip,
          deviceType: payload.device.device_type,
          active: true,
          ...metadata,
        },
        select: { id: true },
      })

      const key = {
        runId: payload.run_id,
        deviceId: device.id,
        feature,
      }
      const existing = await tx.legacyIngestReceipt.findUnique({
        where: { runId_deviceId_feature: key },
      })
      if (existing) {
        if (existing.payloadHash !== payloadHash) throw new IdempotencyConflictError()
        return receiptResult(existing, device.id, true)
      }

      const receipt = await tx.legacyIngestReceipt.create({
        data: { ...key, collectedAt, payloadHash },
        select: { id: true },
      })
      const counts = await apply({
        tx,
        deviceId: device.id,
        receiptId: receipt.id,
        collectedAt,
      })
      await tx.legacyIngestReceipt.update({
        where: { id: receipt.id },
        data: counts,
      })
      return {
        receipt_id: receipt.id,
        duplicate: false,
        device_id: device.id,
        counts,
      }
    })
  } catch (error) {
    if (error instanceof IdempotencyConflictError) throw error
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const raced = await readRacedReceipt(db, feature, payload, payloadHash)
      if (raced) return raced
    }
    throw error
  }
}

export const defaultLegacyDb = prisma as unknown as LegacyDb
