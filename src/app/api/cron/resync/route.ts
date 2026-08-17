import { prisma } from '@/lib/prisma'
import { resyncHost } from '@/lib/apic/resync-host'
import {
  isAuthorized,
  summarizeResults,
  type HostResult,
} from '@/lib/apic/cron-resync'

interface HostEntry {
  apicHostId?: string
  username?: string
  password?: string
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

    results.push(
      await resyncHost({
        apicHostId,
        hostName: apicHost.name,
        host: apicHost.host,
        username: username.trim(),
        password,
      }),
    )
  }

  return Response.json({ status: summarizeResults(results), results })
}
