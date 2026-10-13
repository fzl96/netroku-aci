import 'server-only'

import type { Prisma, PrismaClient } from '@prisma/client'
import { revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import {
  readResyncGroup,
  resyncGroupStatus,
  type ResyncGroupEntry,
} from '@/lib/history/resync-group'
import { normalizeLegacyKey, type LegacyIngestResult } from './common'

export type LegacyRunAuditInput = {
  runId: string
  device: { site: string; hostname: string }
  action: string
  result?: LegacyIngestResult
  error?: string
}

/** Upsert takes a row lock even for an existing run, serializing concurrent device updates. */
export async function updateLegacyRunAudit(
  db: Pick<PrismaClient, '$transaction'>,
  input: LegacyRunAuditInput,
  receivedAt = new Date(),
): Promise<void> {
  const id = `legacy-run:${input.runId}`
  const target = `${input.device.site.trim()}/${input.device.hostname.trim()}`
  const counts = input.result?.counts
  const entry: ResyncGroupEntry = {
    id: JSON.stringify([
      normalizeLegacyKey(input.device.site),
      normalizeLegacyKey(input.device.hostname),
      input.action,
    ]),
    target,
    action: input.action,
    status: input.error ? 'failure' : 'success',
    detail:
      input.error ??
      (counts
        ? `inserted ${counts.inserted}, updated ${counts.updated}, cleared ${counts.cleared}, samples ${counts.samples}`
        : ''),
    receivedAt: receivedAt.toISOString(),
  }
  await db.$transaction(async (tx) => {
    const current = await tx.auditLog.upsert({
      where: { id },
      create: {
        id,
        userName: 'legacy-collector',
        action: 'ingest.legacy.run',
        target: 'Legacy',
        status: 'success',
      },
      // A real update ensures PostgreSQL holds the run row lock until commit.
      update: { userName: 'legacy-collector' },
      select: { payload: true },
    })
    const entries = readResyncGroup(current.payload)?.entries ?? []
    const previous = entries.findIndex((item) => item.id === entry.id)
    // Replayed successful receipts do not add results or change their timestamps.
    if (input.result?.duplicate && previous !== -1 && entries[previous].status === 'success') return
    if (previous === -1) entries.push(entry)
    else entries[previous] = entry
    const devices = new Set(entries.map((item) => JSON.stringify(JSON.parse(item.id).slice(0, 2))))
      .size
    const failures = entries.filter((item) => item.status === 'failure').length
    await tx.auditLog.update({
      where: { id },
      data: {
        status: resyncGroupStatus(entries),
        detail: `${devices} ${devices === 1 ? 'device' : 'devices'}, ${entries.length} results${failures ? `, ${failures} failed` : ''}`,
        payload: { kind: 'resync-group', runId: input.runId, entries } as Prisma.InputJsonValue,
      },
    })
  })
}

/** Audit errors must not change the outcome of an already committed ingestion. */
export async function recordLegacyRunAudit(input: LegacyRunAuditInput): Promise<void> {
  try {
    await updateLegacyRunAudit(prisma, input)
    revalidateTag('history:all', { expire: 0 })
  } catch (error) {
    console.error('[legacy-ingest] failed to record run audit', error)
  }
}
