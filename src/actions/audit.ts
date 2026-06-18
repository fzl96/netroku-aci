'use server'

import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { AuditAction, AuditStatus } from '@/lib/audit'

const MAX_LOGS = 200

export type AuditLogEntry = {
  id: string
  createdAt: Date
  userId: string | null
  userName: string
  action: AuditAction
  target: string | null
  status: AuditStatus
  detail: string | null
  payload: unknown
}

export async function getAuditLogs(): Promise<AuditLogEntry[]> {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: MAX_LOGS,
  })

  return logs.map(log => ({
    id: log.id,
    createdAt: log.createdAt,
    userId: log.userId,
    userName: log.userName,
    action: log.action as AuditAction,
    target: log.target,
    status: log.status as AuditStatus,
    detail: log.detail,
    payload: log.payload ?? null,
  }))
}
