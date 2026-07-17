import type { Prisma } from '@prisma/client'

export type InterfaceView = 'all' | 'crc' | 'state-changed'

export interface InterfaceSnapshotFilterInput {
  apicHostId: string
  view: InterfaceView
  windowStart: Date
  stateChangedInterfaceIds: string[]
  crcInterfaceIds?: string[]
  nodeFilter: string[]
  query?: string
}

export function buildInterfaceSnapshotWhere(
  input: InterfaceSnapshotFilterInput,
): Prisma.InterfaceSnapshotWhereInput {
  const query = input.query?.trim()
  const groups: Prisma.InterfaceSnapshotWhereInput[] = []

  if (input.view === 'state-changed') {
    groups.push({
      OR: [
        { lastLinkStChg: { gte: input.windowStart } },
        { id: { in: input.stateChangedInterfaceIds } },
      ],
    })
  }

  if (query) {
    groups.push({
      OR: [
        { ifName: { contains: query, mode: 'insensitive' } },
        { node: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { dn: { contains: query, mode: 'insensitive' } },
      ],
    })
  }

  return {
    apicHostId: input.apicHostId,
    ...(input.view === 'crc'
      ? { id: { in: input.crcInterfaceIds ?? [] } }
      : {}),
    ...(input.nodeFilter.length > 0 ? { node: { in: input.nodeFilter } } : {}),
    ...(groups.length > 0 ? { AND: groups } : {}),
  }
}
