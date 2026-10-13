import type { AuditStatus } from '@/lib/audit'

export type ResyncGroupEntry = {
  id: string
  target: string
  action: string
  status: AuditStatus
  detail: string
  receivedAt?: string
}

export type ResyncGroupPayload = {
  kind: 'resync-group'
  runId?: string
  entries: ResyncGroupEntry[]
}

export function readResyncGroup(payload: unknown): ResyncGroupPayload | null {
  if (!payload || typeof payload !== 'object' || !('kind' in payload)) return null
  if (payload.kind !== 'resync-group' || !('entries' in payload)) return null
  if (
    !Array.isArray(payload.entries) ||
    !payload.entries.every(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        typeof entry.id === 'string' &&
        typeof entry.target === 'string' &&
        typeof entry.action === 'string' &&
        typeof entry.detail === 'string' &&
        ['success', 'partial', 'failure'].includes(entry.status),
    )
  )
    return null
  return payload as ResyncGroupPayload
}

export function resyncGroupStatus(entries: ResyncGroupEntry[]): AuditStatus {
  if (entries.length === 0 || entries.every((entry) => entry.status === 'failure')) return 'failure'
  if (entries.every((entry) => entry.status === 'success')) return 'success'
  return 'partial'
}
