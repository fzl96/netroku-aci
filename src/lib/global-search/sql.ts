import { Prisma } from '@prisma/client'
import { SEARCH_CATALOG, macExpression, searchTextExpression } from './catalog'
import {
  SEARCH_LIMIT,
  escapeLike,
  normalizedMac,
  normalizeSearchQuery,
  type RecordGroup,
} from './types'

/** Ranking and placement grouping happen in PostgreSQL before LIMIT, never on an arbitrary sample. */
export function buildSearchSql(group: RecordGroup, query: string, history: boolean): Prisma.Sql {
  const c = SEARCH_CATALOG[group]
  const raw = Prisma.raw
  const needle = normalizeSearchQuery(query)
  const contains = `%${escapeLike(needle)}%`
  const prefix = `${escapeLike(needle)}%`
  const mac = c.mac ? normalizedMac(needle) : null
  const fields = c.fields.map((field) => raw(`lower(coalesce(r."${field}", ''))`))
  const exact = Prisma.sql`(${Prisma.join(
    fields.map((field) => Prisma.sql`${field} = ${needle}`),
    ' OR ',
  )} ${mac ? Prisma.sql`OR ${raw(macExpression())} = ${mac}` : Prisma.empty})`
  const starts = Prisma.sql`(${Prisma.join(
    fields.map((field) => Prisma.sql`${field} LIKE ${prefix}`),
    ' OR ',
  )})`
  const match = Prisma.sql`(${raw(searchTextExpression(c.fields))} LIKE ${contains} ${mac ? Prisma.sql`OR ${raw(macExpression())} LIKE ${`%${escapeLike(mac)}%`}` : Prisma.empty})`
  const active = c.mac && history ? Prisma.sql`true` : raw(c.current)
  const partition = c.mac ? raw(`${c.sourceId}, ${macExpression()}`) : raw('r.id')
  const latest = c.mac ? raw(`r."lastSeenAt" DESC, r.id`) : raw('r.id')
  return Prisma.sql`
    WITH matches AS (
      SELECT r.id, ${raw(c.title)} AS title, ${raw(c.detail)} AS detail,
        ${raw(c.sourceId)} AS "sourceId", ${raw(c.sourceName)} AS "sourceName",
        ${raw(c.identity)} AS identity, ${raw(c.current)} AS active,
        row_number() OVER (PARTITION BY ${partition} ORDER BY ${raw(c.current)} DESC, ${latest}) AS placement,
        count(*) OVER (PARTITION BY ${partition})::int AS matches,
        min(CASE WHEN ${exact} THEN 0 WHEN ${starts} THEN 1 ELSE 2 END) OVER (PARTITION BY ${partition}) AS "groupRank"
      FROM ${raw(c.table)} r ${raw(c.join)} WHERE ${active} AND ${match}
    )
    SELECT id, title, detail, "sourceId", "sourceName", identity, active, matches
    FROM matches WHERE placement = 1 ORDER BY "groupRank", lower(title), "sourceId", id LIMIT ${SEARCH_LIMIT}
  `
}
