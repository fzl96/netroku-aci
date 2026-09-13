import 'server-only'

import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildSearchSql } from './sql'
import { serializeSearchResult, type SearchRow } from './results'
import {
  RECORD_GROUPS,
  MIN_RECORD_QUERY,
  normalizeSearchQuery,
  type RecordGroup,
  type SearchResponse,
} from './types'

export async function searchRecords(
  query: string,
  history = false,
  onlyGroup?: RecordGroup,
): Promise<SearchResponse> {
  // All selected operational types are session-readable in the existing domain model.
  // No persistent cache: results reflect current snapshots and cannot cross auth boundaries.
  await requireSession()
  const needle = normalizeSearchQuery(query)
  if (needle.length < MIN_RECORD_QUERY) return { groups: [] }
  const groups = onlyGroup ? [onlyGroup] : (Object.keys(RECORD_GROUPS) as RecordGroup[])
  return {
    groups: await Promise.all(
      groups.map(async (group) => {
        try {
          const rows = await prisma.$transaction(
            async (tx) => {
              await tx.$executeRaw`SET LOCAL statement_timeout = '2000ms'`
              return tx.$queryRaw<SearchRow[]>(buildSearchSql(group, needle, history))
            },
            { maxWait: 2000, timeout: 4000 },
          )
          return {
            id: group,
            label: RECORD_GROUPS[group],
            items: rows.map((row) => serializeSearchResult(group, row, history)),
          }
        } catch (error) {
          console.error(
            `[global-search] ${group} read failed`,
            error instanceof Error ? error.name : 'UnknownError',
          )
          return { id: group, label: RECORD_GROUPS[group], items: [], error: true }
        }
      }),
    ),
  }
}
