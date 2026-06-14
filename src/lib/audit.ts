import type { Prisma } from '@prisma/client'
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
  | 'user.create'
  | 'user.delete'

export type AuditStatus = 'success' | 'partial' | 'failure'

type AuditInput = {
  userId?: string | null
  userName: string
  action: AuditAction
  target?: string | null
  status?: AuditStatus
  detail?: string | null
  payload?: unknown
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
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
  } catch (err) {
    console.error('[audit] failed to record', input.action, err)
  }
}
