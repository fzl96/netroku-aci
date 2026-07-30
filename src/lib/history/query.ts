import type { Prisma } from '@prisma/client'
import type { AuditAction } from '@/lib/audit'

export const HISTORY_PAGE_SIZE = 20

export const HISTORY_ACTION_LABELS: Record<AuditAction, string> = {
  'apic_host.create': 'Host added',
  'apic_host.update': 'Host updated',
  'apic_host.delete': 'Host deleted',
  deploy: 'Deploy',
  rollback: 'Rollback',
  'resync.endpoints': 'Resync endpoints',
  'resync.interfaces': 'Resync interfaces',
  'resync.faults': 'Resync faults',
  'resync.health': 'Resync health',
  'resync.nodes': 'Resync nodes',
  'resync.epgs': 'Resync EPGs',
  'ingest.legacy.health': 'Ingest legacy health',
  'ingest.legacy.interfaces': 'Ingest legacy interfaces',
  'ingest.legacy.endpoints': 'Ingest legacy endpoints',
  'user.create': 'User created',
  'user.delete': 'User deleted',
}

const HISTORY_ACTIONS = Object.keys(HISTORY_ACTION_LABELS) as AuditAction[]

export type HistoryActionFilter = AuditAction | 'all'

export type HistoryPageParams = {
  query: string
  action: HistoryActionFilter
  page: number
}

export function parseHistoryPageParams(input: {
  query?: string
  action?: string
  page?: string
}): HistoryPageParams {
  const parsedPage = Number.parseInt(input.page ?? '1', 10)
  return {
    query: input.query?.trim() ?? '',
    action: HISTORY_ACTIONS.includes(input.action as AuditAction)
      ? input.action as AuditAction
      : 'all',
    page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
  }
}

export function buildHistoryWhere(
  params: HistoryPageParams,
): Prisma.AuditLogWhereInput {
  const matchingActions = params.query
    ? HISTORY_ACTIONS.filter(action =>
        HISTORY_ACTION_LABELS[action]
          .toLowerCase()
          .includes(params.query.toLowerCase()))
    : []

  return {
    ...(params.action !== 'all' ? { action: params.action } : {}),
    ...(params.query
      ? {
          OR: [
            { userName: { contains: params.query, mode: 'insensitive' } },
            { target: { contains: params.query, mode: 'insensitive' } },
            { detail: { contains: params.query, mode: 'insensitive' } },
            ...(matchingActions.length > 0
              ? [{ action: { in: matchingActions } }]
              : []),
          ],
        }
      : {}),
  }
}

export function clampHistoryPage(page: number, total: number): number {
  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE))
  return Math.min(Math.max(1, page), totalPages)
}

export function historyPageWindow(page: number, total: number) {
  const effectivePage = clampHistoryPage(page, total)
  return {
    page: effectivePage,
    skip: (effectivePage - 1) * HISTORY_PAGE_SIZE,
    take: HISTORY_PAGE_SIZE,
  }
}

export function buildHistoryUrl(params: HistoryPageParams): string {
  const search = new URLSearchParams()
  if (params.query.trim()) search.set('query', params.query.trim())
  if (params.action !== 'all') search.set('action', params.action)
  if (params.page > 1) search.set('page', String(params.page))
  const queryString = search.toString()
  return `/history${queryString ? `?${queryString}` : ''}`
}
