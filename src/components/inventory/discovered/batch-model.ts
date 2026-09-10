import type { DiscoveryData } from '@/lib/inventory/sources/query'
import { serialKey } from '@/lib/inventory/sources/identity'

export type Row = DiscoveryData['rows'][number] & { kind: DiscoveryData['kind'] }
export type Draft = {
  mode: 'CREATE' | 'LINK' | 'STACK'
  targetId: string
  name: string
  serialNumber: string
  model: string
  vendor: string
  height: string
  assetTag: string
  stackName: string
  memberIds: string[]
  relink: boolean
}
export { groupFor, type DiscoveryGroup as Group } from '@/lib/inventory/sources/groups'
export const rowKey = (row: Row) => `${row.kind}:${row.id}`
export function initialDraft(row: Row): Draft {
  return {
    mode: row.matchCount === 1 ? 'LINK' : 'CREATE',
    targetId: row.matchCount === 1 ? row.matchId! : '',
    name: row.name,
    serialNumber: serialKey(row.serial) ? row.serial! : '',
    model: row.model ?? '',
    vendor: row.vendor,
    height: '',
    assetTag: '',
    stackName: row.name,
    memberIds: [],
    relink: false,
  }
}
export function blocker(
  row: Row,
  d: Draft,
  devices: DiscoveryData['devices'],
  stacks: DiscoveryData['stacks'],
): string | null {
  if (!row.present) return 'Missing from latest scan'
  if (row.conflict) return row.conflict
  if (row.link && !d.relink)
    return row.link.conflict || 'Already linked; review before replacing the source'
  const target =
    d.mode === 'STACK'
      ? stacks.find((s) => s.id === d.targetId)
      : devices.find((s) => s.id === d.targetId)
  if (target?.source && !d.relink) return 'Target already has a source'
  if (d.mode === 'LINK') {
    const device = devices.find((s) => s.id === d.targetId)
    if (!device) return 'Choose an existing asset'
    if (!serialKey(device.serialNumber)) return 'Target needs a valid physical serial'
    if (serialKey(row.serial) && serialKey(row.serial) !== serialKey(device.serialNumber))
      return 'Physical serials do not match'
    if (row.matchCount > 1) return 'Duplicate inventory serials must be resolved'
  }
  if (d.mode === 'CREATE') {
    if (row.matchCount) return 'An asset already has this serial; link it instead'
    if (!serialKey(d.serialNumber)) return 'Enter a physical serial'
    if (![d.name, d.model, d.vendor].every((v) => v.trim()))
      return 'Complete hostname, model, and vendor'
    if ([d.name, d.model, d.vendor, d.serialNumber, d.assetTag].some((v) => v.length > 128))
      return 'Fields must be 128 characters or fewer'
    if (!Number.isInteger(Number(d.height)) || Number(d.height) < 1 || Number(d.height) > 60)
      return 'Set height between 1 and 60U'
  }
  if (d.mode === 'STACK') {
    if (row.kind !== 'LEGACY') return 'Only Legacy records can represent a stack'
    const stack = stacks.find((s) => s.id === d.targetId)
    if (d.targetId && !stack) return 'Choose an existing stack'
    if (stack && !stack.devices.length) return 'The stack needs at least one physical member'
    if (
      !d.targetId &&
      d.memberIds.some((id) => !devices.some((device) => device.id === id && !device.deviceStackId))
    )
      return 'Choose available physical members'
    if (
      row.link?.deviceId &&
      !(stack
        ? stack.devices.some((m) => m.id === row.link!.deviceId)
        : d.memberIds.includes(row.link.deviceId))
    )
      return 'Include the original physical device in this stack'
    if (!d.targetId && (!d.stackName.trim() || !d.memberIds.length))
      return 'Choose a stack or its physical members'
    if (d.stackName.length > 128 || d.memberIds.length > 32)
      return 'Use a name up to 128 characters and at most 32 members'
  }
  return null
}
export function selectionConflict(
  row: Row,
  draft: (row: Row) => Draft,
  chosen: Row[],
): string | null {
  const d = draft(row)
  const conflict = chosen.some((other) => {
    if (rowKey(other) === rowKey(row)) return false
    const otherDraft = draft(other)
    return Boolean(
      (d.targetId && d.targetId === otherDraft.targetId && d.mode === otherDraft.mode) ||
      (d.mode === 'CREATE' &&
        otherDraft.mode === 'CREATE' &&
        serialKey(d.serialNumber) &&
        serialKey(d.serialNumber) === serialKey(otherDraft.serialNumber)) ||
      (d.mode === 'STACK' &&
        otherDraft.mode === 'STACK' &&
        !d.targetId &&
        !otherDraft.targetId &&
        d.memberIds.some((id) => otherDraft.memberIds.includes(id))),
    )
  })
  return conflict ? 'Another selected discovery uses this target, serial, or stack member' : null
}
