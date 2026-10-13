import { describe, expect, it, mock } from 'bun:test'
import { PrismaClient } from '@prisma/client'
import { readResyncGroup } from '@/lib/history/resync-group'

mock.module('server-only', () => ({}))
mock.module('next/cache', () => ({ revalidateTag: () => {} }))
const { updateLegacyRunAudit } = await import('./run-audit')

const databaseUrl = process.env.LEGACY_AUDIT_INTEGRATION_DATABASE_URL
const integrationIt = databaseUrl ? it : it.skip

describe('legacy run history PostgreSQL aggregation', () => {
  integrationIt(
    'preserves concurrent devices, features, retries, failures, and separate runs',
    async () => {
      const db = new PrismaClient({ datasourceUrl: databaseUrl })
      const runId = crypto.randomUUID()
      const otherRunId = crypto.randomUUID()
      const olderId = `old-history-${runId}`
      const success = {
        receipt_id: 'r1',
        device_id: 'd1',
        duplicate: false,
        counts: { inserted: 2, updated: 3, cleared: 1, samples: 4 },
      }
      const input = {
        runId,
        device: { site: 'Jakarta', hostname: 'sw1' },
        action: 'ingest.legacy.health',
        result: success,
      }
      const before = new Date('2026-07-21T00:00:00Z')
      try {
        await db.auditLog.create({
          data: {
            id: olderId,
            userName: 'legacy-collector',
            action: 'ingest.legacy.health',
            status: 'success',
            detail: 'existing device history',
          },
        })
        // Different requests can arrive in parallel across devices and features.
        await Promise.all(
          Array.from({ length: 12 }, (_, index) =>
            updateLegacyRunAudit(
              db,
              { ...input, device: { site: 'Jakarta', hostname: `sw${index}` } },
              before,
            ),
          ),
        )
        await updateLegacyRunAudit(db, { ...input, action: 'ingest.legacy.interfaces' }, before)
        await updateLegacyRunAudit(
          db,
          { ...input, result: { ...success, duplicate: true } },
          new Date(),
        )
        const audit = await db.auditLog.findUniqueOrThrow({ where: { id: `legacy-run:${runId}` } })
        const group = readResyncGroup(audit.payload)!
        expect(audit.action).toBe('ingest.legacy.run')
        expect(audit.status).toBe('success')
        expect(audit.detail).toBe('12 devices, 13 results')
        expect(group.entries).toHaveLength(13)
        expect(group.entries.every((entry) => entry.receivedAt === before.toISOString())).toBe(true)
        expect(group.entries[0].detail).toBe('inserted 2, updated 3, cleared 1, samples 4')

        await updateLegacyRunAudit(db, {
          runId,
          device: { site: 'Surabaya', hostname: 'offline' },
          action: 'ingest.legacy.health',
          error: 'Legacy ingestion failed',
        })
        const partial = await db.auditLog.findUniqueOrThrow({
          where: { id: `legacy-run:${runId}` },
        })
        expect(partial.status).toBe('partial')
        expect(
          readResyncGroup(partial.payload)?.entries.find(
            (entry) => entry.target === 'Surabaya/offline',
          )?.detail,
        ).toBe('Legacy ingestion failed')

        // A successful retry replaces the failed result rather than adding another device.
        await updateLegacyRunAudit(db, {
          ...input,
          device: { site: ' Surabaya ', hostname: ' OFFLINE ' },
        })
        const recovered = await db.auditLog.findUniqueOrThrow({
          where: { id: `legacy-run:${runId}` },
        })
        expect(recovered.status).toBe('success')
        expect(readResyncGroup(recovered.payload)?.entries).toHaveLength(14)

        await updateLegacyRunAudit(db, { ...input, runId: otherRunId })
        expect(
          await db.auditLog.count({
            where: { id: { in: [`legacy-run:${runId}`, `legacy-run:${otherRunId}`] } },
          }),
        ).toBe(2)
        expect((await db.auditLog.findUniqueOrThrow({ where: { id: olderId } })).detail).toBe(
          'existing device history',
        )
      } finally {
        await db.auditLog.deleteMany({
          where: { id: { in: [olderId, `legacy-run:${runId}`, `legacy-run:${otherRunId}`] } },
        })
        await db.$disconnect()
      }
    },
  )
})
