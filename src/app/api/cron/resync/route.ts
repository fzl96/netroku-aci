import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import { resyncEndpoints } from '@/lib/apic/endpoints'
import { resyncInterfaces } from '@/lib/apic/interfaces'
import { resyncFaults } from '@/lib/apic/faults'
import {
  isAuthorized,
  summarizeResults,
  type DatasetResult,
  type HostResult,
} from '@/lib/apic/cron-resync'

interface HostEntry {
  apicHostId?: string
  username?: string
  password?: string
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export async function POST(request: Request) {
  const token = process.env.SCHEDULER_TOKEN
  if (!token) {
    return Response.json({ error: 'Scheduler endpoint is not configured' }, { status: 503 })
  }
  if (!isAuthorized(request.headers.get('authorization'), token)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let hosts: HostEntry[]
  try {
    const body = (await request.json()) as { hosts?: HostEntry[] }
    hosts = body.hosts ?? []
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!Array.isArray(hosts) || hosts.length === 0) {
    return Response.json({ error: 'hosts must be a non-empty array' }, { status: 400 })
  }

  const results: HostResult[] = []

  for (const entry of hosts) {
    const apicHostId = entry?.apicHostId
    const username = entry?.username
    const password = entry?.password

    if (!apicHostId || !username?.trim() || !password) {
      results.push({
        apicHostId: apicHostId ?? null,
        host: null,
        error: 'apicHostId, username and password are required',
      })
      continue
    }

    const apicHost = await prisma.apicHost.findFirst({ where: { id: apicHostId } })
    if (!apicHost) {
      results.push({ apicHostId, host: null, error: 'Host not found' })
      continue
    }

    const trimmedUser = username.trim()
    const result: HostResult = { apicHostId, host: apicHost.name }

    // Endpoints
    let endpoints: DatasetResult
    try {
      endpoints = await resyncEndpoints({
        apicHostId,
        host: apicHost.host,
        username: trimmedUser,
        password,
      })
    } catch (err) {
      endpoints = { error: errorMessage(err, 'Failed to resync endpoints') }
    }
    result.endpoints = endpoints
    await recordAudit({
      userId: null,
      userName: 'scheduler',
      action: 'resync.endpoints',
      target: `${apicHost.name} (${apicHost.host})`,
      status: 'error' in endpoints ? 'failure' : 'success',
      detail: 'error' in endpoints
        ? endpoints.error
        : `synced ${endpoints.synced} (total ${endpoints.total})`,
    })

    // Interfaces
    let interfaces: DatasetResult
    try {
      interfaces = await resyncInterfaces({
        apicHostId,
        host: apicHost.host,
        username: trimmedUser,
        password,
      })
    } catch (err) {
      interfaces = { error: errorMessage(err, 'Failed to resync interfaces') }
    }
    result.interfaces = interfaces
    await recordAudit({
      userId: null,
      userName: 'scheduler',
      action: 'resync.interfaces',
      target: `${apicHost.name} (${apicHost.host})`,
      status: 'error' in interfaces ? 'failure' : 'success',
      detail: 'error' in interfaces
        ? interfaces.error
        : `synced ${interfaces.synced} (total ${interfaces.total})`,
    })

    // Faults
    let faults: DatasetResult
    try {
      faults = await resyncFaults({
        apicHostId,
        host: apicHost.host,
        username: trimmedUser,
        password,
      })
    } catch (err) {
      faults = { error: errorMessage(err, 'Failed to resync faults') }
    }
    result.faults = faults
    await recordAudit({
      userId: null,
      userName: 'scheduler',
      action: 'resync.faults',
      target: `${apicHost.name} (${apicHost.host})`,
      status: 'error' in faults ? 'failure' : 'success',
      detail: 'error' in faults
        ? faults.error
        : `synced ${faults.synced} (total ${faults.total})`,
    })

    results.push(result)
  }

  return Response.json({ status: summarizeResults(results), results })
}
