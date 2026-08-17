import { recordAudit } from '@/lib/audit'
import { decrypt } from '@/lib/crypto'
import { isAuthorized, summarizeResults } from '@/lib/apic/cron-resync'
import { claimNextDueSchedule, finalizeSchedule } from '@/lib/apic/schedule-claim'
import { resyncHost } from '@/lib/apic/resync-host'

/** Safety valve: never work through more than this many schedules in one tick. */
const MAX_PER_TICK = 20

export async function POST(request: Request) {
  const token = process.env.SCHEDULER_TOKEN
  if (!token) {
    return Response.json({ error: 'Scheduler endpoint is not configured' }, { status: 503 })
  }
  if (!isAuthorized(request.headers.get('authorization'), token)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Array<{ apicHostId: string; host: string; status: string }> = []

  for (let i = 0; i < MAX_PER_TICK; i += 1) {
    const claimed = await claimNextDueSchedule()
    if (!claimed) break

    let status: 'success' | 'partial' | 'failure' = 'failure'
    let detail = ''

    try {
      // A single undecryptable row must not stop the other hosts.
      let username: string
      let password: string
      try {
        username = decrypt(claimed.encUsername)
        password = decrypt(claimed.encPassword)
      } catch {
        detail = 'Credential decryption failed — re-enter the credentials for this host'
        await recordAudit({
          userId: null,
          userName: 'scheduler',
          action: 'resync.schedule.run',
          target: `${claimed.hostName} (${claimed.host})`,
          status: 'failure',
          detail,
        })
        continue
      }

      const hostResult = await resyncHost({
        apicHostId: claimed.apicHostId,
        hostName: claimed.hostName,
        host: claimed.host,
        username,
        password,
      })
      status = summarizeResults([hostResult])
      detail = describeResult(hostResult)
    } catch (err) {
      detail = err instanceof Error ? err.message : 'Scheduled resync failed'
    } finally {
      // A vanished row (host deleted mid-run → ON DELETE CASCADE) must not abort the whole tick.
      try {
        await finalizeSchedule({
          id: claimed.id,
          intervalMinutes: claimed.intervalMinutes,
          status,
          detail,
        })
      } catch (err) {
        console.error('[tick] failed to finalize schedule', claimed.id, err)
      }
    }

    results.push({ apicHostId: claimed.apicHostId, host: claimed.hostName, status })
  }

  return Response.json({ ran: results.length, results })
}

function describeResult(result: {
  endpoints?: unknown
  interfaces?: unknown
  nodes?: unknown
  epgs?: unknown
}): string {
  const parts: string[] = []
  for (const [name, value] of Object.entries(result)) {
    if (!value || typeof value !== 'object') continue
    if ('error' in value) parts.push(`${name}: ${(value as { error: string }).error}`)
    else if ('synced' in value) parts.push(`${name}: ${(value as { synced: number }).synced}`)
  }
  return parts.join('; ')
}
