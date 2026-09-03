import type { Prisma } from '@prisma/client'
import { HISTORY_ACTION_LABELS, HISTORY_ACTIONS, type HistoryPageParams } from './params'

export function buildHistoryWhere(params: HistoryPageParams): Prisma.AuditLogWhereInput {
  const query = params.query.trim()
  const matchingActions = query
    ? HISTORY_ACTIONS.filter((action) =>
        HISTORY_ACTION_LABELS[action].toLowerCase().includes(query.toLowerCase()),
      )
    : []

  return {
    ...(params.action !== 'all' ? { action: params.action } : {}),
    ...(query
      ? {
          OR: [
            { userName: { contains: query, mode: 'insensitive' } },
            { target: { contains: query, mode: 'insensitive' } },
            { detail: { contains: query, mode: 'insensitive' } },
            ...(matchingActions.length > 0 ? [{ action: { in: matchingActions } }] : []),
          ],
        }
      : {}),
  }
}
