'use server'

import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { AuditAction, AuditStatus } from '@/lib/audit'
import {
  buildHistoryWhere,
  historyPageWindow,
  type HistoryPageParams,
} from '@/lib/history/query'

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

export type AuditLogPage = {
  logs: AuditLogEntry[]
  total: number
  page: number
}

function serializeAuditLog(log: {
  id: string
  createdAt: Date
  userId: string | null
  userName: string
  action: string
  target: string | null
  status: string
  detail: string | null
  payload: unknown
}): AuditLogEntry {
  return {
    id: log.id,
    createdAt: log.createdAt,
    userId: log.userId,
    userName: log.userName,
    action: log.action as AuditAction,
    target: log.target,
    status: log.status as AuditStatus,
    detail: log.detail,
    payload: log.payload ?? null,
  }
}

export async function getAuditLogPage(
  params: HistoryPageParams,
): Promise<AuditLogPage> {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')

  const where = buildHistoryWhere(params)
  const total = await prisma.auditLog.count({ where })
  const window = historyPageWindow(params.page, total)
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: window.skip,
    take: window.take,
  })

  return {
    logs: logs.map(serializeAuditLog),
    total,
    page: window.page,
  }
}
