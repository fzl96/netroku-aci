import type { Prisma } from '@prisma/client'

export type EpgPresenceFilter = 'present' | 'absent'

export interface EpgFilters {
  query?: string
  tenant?: string[]
  ap?: string[]
  presence?: EpgPresenceFilter[]
}

export interface BindingFilters extends EpgFilters {
  node?: string[]
}

export type EpgWithBindings = Prisma.EpgSnapshotGetPayload<{
  include: { bindings: true }
}>

export type BindingWithEpg = Prisma.EpgPathBindingGetPayload<{
  include: {
    epg: { select: { name: true; tenant: true; appProfile: true; dn: true; present: true } }
  }
}>

export function countActiveEpgFilterGroups(filters: BindingFilters): number {
  return [filters.tenant, filters.ap, filters.node, filters.presence]
    .filter(values => values && values.length > 0)
    .length
}

function presentValue(presence?: EpgPresenceFilter[]): boolean | undefined {
  if (presence?.length !== 1) return undefined
  return presence[0] === 'present'
}

export function buildEpgWhere(
  apicHostId: string,
  filters: EpgFilters,
): Prisma.EpgSnapshotWhereInput {
  const query = filters.query?.trim()
  const present = presentValue(filters.presence)

  return {
    apicHostId,
    ...(filters.tenant?.length ? { tenant: { in: filters.tenant } } : {}),
    ...(filters.ap?.length ? { appProfile: { in: filters.ap } } : {}),
    ...(present !== undefined ? { present } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { tenant: { contains: query, mode: 'insensitive' } },
            { appProfile: { contains: query, mode: 'insensitive' } },
            { bridgeDomain: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { dn: { contains: query, mode: 'insensitive' } },
          ],
        }
      : {}),
  }
}

/** A selected leaf matches an exact node or either member of a vPC pair. */
function nodeCondition(value: string): Prisma.EpgPathBindingWhereInput {
  return {
    OR: [
      { node: value },
      { node: { startsWith: `${value}-` } },
      { node: { endsWith: `-${value}` } },
    ],
  }
}

export function buildBindingWhere(
  apicHostId: string,
  filters: BindingFilters,
): Prisma.EpgPathBindingWhereInput {
  const query = filters.query?.trim()
  const present = presentValue(filters.presence)

  const epgWhere: Prisma.EpgSnapshotWhereInput = {
    ...(filters.tenant?.length ? { tenant: { in: filters.tenant } } : {}),
    ...(filters.ap?.length ? { appProfile: { in: filters.ap } } : {}),
  }

  return {
    apicHostId,
    ...(present !== undefined ? { present } : {}),
    ...(Object.keys(epgWhere).length > 0 ? { epg: epgWhere } : {}),
    ...(filters.node?.length
      ? { AND: [{ OR: filters.node.flatMap(v => nodeCondition(v).OR!) }] }
      : {}),
    ...(query
      ? {
          OR: [
            { node: { contains: query, mode: 'insensitive' } },
            { port: { contains: query, mode: 'insensitive' } },
            { encap: { contains: query, mode: 'insensitive' } },
            { epg: { name: { contains: query, mode: 'insensitive' } } },
            { epg: { tenant: { contains: query, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }
}

const NATURAL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

/** Distinct stored node values ("101", "101-102") → individual leaf options. */
export function expandNodeOptions(values: string[]): string[] {
  const leaves = new Set<string>()
  for (const value of values) {
    for (const leaf of value.split('-')) {
      if (leaf) leaves.add(leaf)
    }
  }
  return Array.from(leaves).sort((a, b) => NATURAL_COLLATOR.compare(a, b))
}
