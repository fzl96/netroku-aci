import 'server-only'

import type { Prisma } from '@prisma/client'
import { revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'

export type AuditAction =
  | 'apic_host.create'
  | 'apic_host.update'
  | 'apic_host.delete'
  | 'deploy'
  | 'rollback'
  | 'resync.endpoints'
  | 'resync.interfaces'
  | 'resync.faults'
  | 'resync.health'
  | 'resync.nodes'
  | 'resync.epgs'
  | 'ingest.legacy.health'
  | 'ingest.legacy.interfaces'
  | 'ingest.legacy.endpoints'
  | 'user.create'
  | 'user.delete'
  | 'resync.schedule.run'
  | 'resync.schedule.update'
  | 'resync.schedule.delete'
  | 'site.create'
  | 'site.update'
  | 'site.delete'
  | 'rack.create'
  | 'rack.update'
  | 'rack.delete'
  | 'device.create'
  | 'device.update'
  | 'device.delete'
  | 'device.place'
  | 'device.unassign'
  | 'device.resize'
  | 'device.import'
  | 'inventory.link'
  | 'inventory.unlink'
  | 'inventory.relink'
  | 'inventory.reconcile'

export type AuditStatus = 'success' | 'partial' | 'failure'

export type AuditInput = {
  userId?: string | null
  userName: string
  action: AuditAction
  target?: string | null
  status?: AuditStatus
  detail?: string | null
  payload?: unknown
}

type AuditRecorderDependencies = {
  createAuditLog: (args: Parameters<typeof prisma.auditLog.create>[0]) => Promise<unknown>
  revalidateTag: (tag: string, profile: { expire: number }) => void
  reportError: (error: unknown, input: AuditInput) => void
}

export function createAuditRecorder(dependencies: AuditRecorderDependencies) {
  return async function recordAudit(input: AuditInput): Promise<void> {
    try {
      await dependencies.createAuditLog({
        data: {
          userId: input.userId ?? null,
          userName: input.userName,
          action: input.action,
          target: input.target ?? null,
          status: input.status ?? 'success',
          detail: input.detail ?? null,
          payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      })
      dependencies.revalidateTag('history:all', { expire: 0 })
    } catch (error) {
      dependencies.reportError(error, input)
    }
  }
}

export const recordAudit = createAuditRecorder({
  createAuditLog: (args) => prisma.auditLog.create(args),
  revalidateTag,
  reportError: (error, input) => {
    console.error('[audit] failed to record', input.action, error)
  },
})
