import { serialKey } from './identity'

export const discoveryGroups = [
  'Ready to link',
  'New devices',
  'Needs attention',
  'Linked',
] as const
export type DiscoveryGroup = (typeof discoveryGroups)[number]

type GroupedRow = {
  present: boolean
  conflict?: string | null
  serial?: string | null
  reserved: boolean
  matchCount: number
  matchId: string | null
  link: { conflict: string | null } | null
}

// Shared by the server (group counts and per-group pages) and the client batch model.
export function groupFor(
  row: GroupedRow,
  devices: { id: string; source: unknown }[],
): DiscoveryGroup {
  if (row.link && !row.reserved && !row.link.conflict && !row.conflict) return 'Linked'
  if (
    !row.present ||
    row.conflict ||
    row.reserved ||
    row.link?.conflict ||
    row.matchCount > 1 ||
    !serialKey(row.serial)
  )
    return 'Needs attention'
  if (row.matchCount === 1)
    return devices.find((d) => d.id === row.matchId)?.source ? 'Needs attention' : 'Ready to link'
  return 'New devices'
}

export function parseGroup(value: string | undefined): DiscoveryGroup | null {
  return discoveryGroups.find((group) => group === value) ?? null
}
