import type { AuditInput } from '@/lib/audit'
import type { HostResult } from './cron-resync'
import { resyncGroupStatus, type ResyncGroupEntry } from '@/lib/history/resync-group'

/** One audit per scheduler site run, including failures before collection or during finalization. */
export function buildScheduledResyncAudit(
  host: { hostName: string; host: string },
  result: HostResult,
  finalizationError?: string,
): AuditInput {
  const target = `${host.hostName} (${host.host})`
  const entries: ResyncGroupEntry[] = []
  for (const name of ['endpoints', 'interfaces', 'nodes', 'epgs', 'bds'] as const) {
    const dataset = result[name]
    if (!dataset) continue
    let detail: string
    if ('error' in dataset) detail = dataset.error
    else if (name === 'epgs')
      detail = `synced ${dataset.synced} EPGs, ${dataset.total - dataset.synced} static port bindings`
    else if (name === 'nodes')
      detail = `synced ${dataset.synced} nodes, ${dataset.total - dataset.synced} components`
    else if (name === 'bds') detail = `synced ${dataset.synced} Bridge Domains`
    else detail = `synced ${dataset.synced} (total ${dataset.total})`
    entries.push({
      id: name,
      target,
      action: `resync.${name}`,
      status: 'error' in dataset ? 'failure' : 'success',
      detail,
    })
  }
  if (result.error) {
    entries.push({
      id: 'run',
      target,
      action: 'resync.schedule.run',
      status: 'failure',
      detail: result.error,
    })
  }
  if (finalizationError) {
    entries.push({
      id: 'finalization',
      target,
      action: 'resync.schedule.run',
      status: 'failure',
      detail: finalizationError,
    })
  }
  return {
    userId: null,
    userName: 'scheduler',
    action: 'resync.schedule.run',
    target,
    status: resyncGroupStatus(entries),
    detail:
      result.error ??
      `${entries.length} results, ${entries.filter((entry) => entry.status === 'failure').length} failed`,
    payload: { kind: 'resync-group', entries },
  }
}
