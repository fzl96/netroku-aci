import 'server-only'

import type { Prisma } from '@prisma/client'
import { unstable_cache } from 'next/cache'
import { AuthenticationRequiredError, requireSession } from '@/lib/auth'
import type { AuditAction, AuditStatus } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { buildHistoryWhere } from './filters'
import {
  historyPageWindow,
  type HistoryPageParams,
} from './params'

const HISTORY_CACHE_SECONDS = 8 * 60 * 60

const AUDIT_LOG_SELECT = {
  id: true,
  createdAt: true,
  userId: true,
  userName: true,
  action: true,
  target: true,
  status: true,
  detail: true,
  payload: true,
} satisfies Prisma.AuditLogSelect

type StoredAuditLog = Prisma.AuditLogGetPayload<{
  select: typeof AUDIT_LOG_SELECT
}>

export type HistoryLogEntry = {
  id: string
  createdAt: string
  userId: string | null
  userName: string
  action: AuditAction
  target: string | null
  status: AuditStatus
  detail: string | null
  payload: unknown
}

export type HistoryPageData = {
  logs: HistoryLogEntry[]
  total: number
  page: number
}

export class HistoryReadError extends Error {
  readonly code = 'unauthorized'

  constructor() {
    super('Unauthorized')
    this.name = 'HistoryReadError'
  }
}

function serializeAuditLog(log: StoredAuditLog): HistoryLogEntry {
  return {
    id: log.id,
    createdAt: log.createdAt.toISOString(),
    userId: log.userId,
    userName: log.userName,
    action: log.action as AuditAction,
    target: log.target,
    status: log.status as AuditStatus,
    detail: log.detail,
    payload: log.payload ?? null,
  }
}

async function authorizeHistoryRead(): Promise<void> {
  try {
    await requireSession()
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error
    throw new HistoryReadError()
  }
}

export async function getHistoryPage(params: HistoryPageParams): Promise<HistoryPageData> {
  await authorizeHistoryRead()

  const normalized = {
    query: params.query.trim(),
    action: params.action,
    page: params.page,
  }

  return unstable_cache(async (): Promise<HistoryPageData> => {
    const where = buildHistoryWhere(normalized)
    const total = await prisma.auditLog.count({ where })
    const window = historyPageWindow(normalized.page, total)
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: window.skip,
      take: window.take,
      select: AUDIT_LOG_SELECT,
    })

    return {
      logs: logs.map(serializeAuditLog),
      total,
      page: window.page,
    }
  }, [
    'history',
    'page',
    normalized.query,
    normalized.action,
    String(normalized.page),
  ], {
    tags: ['history:all'],
    revalidate: HISTORY_CACHE_SECONDS,
  })()
}
