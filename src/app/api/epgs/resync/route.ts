import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import {
  resyncEpgs,
  EpgResyncInProgressError,
  type ResyncEpgsResult,
} from '@/lib/apic/epg-resync'

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let apicHostId: string
  let username: string
  let password: string
  try {
    ;({ apicHostId, username, password } = await request.json())
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!apicHostId) return Response.json({ error: 'apicHostId is required' }, { status: 400 })
  if (!username?.trim() || !password) {
    return Response.json({ error: 'username and password are required' }, { status: 400 })
  }

  const apicHost = await prisma.apicHost.findFirst({ where: { id: apicHostId } })
  if (!apicHost) return Response.json({ error: 'Host not found' }, { status: 404 })

  let result: ResyncEpgsResult
  try {
    result = await resyncEpgs({
      apicHostId,
      host: apicHost.host,
      username: username.trim(),
      password,
    })
  } catch (err) {
    if (err instanceof EpgResyncInProgressError) {
      return Response.json({ error: err.message }, { status: 409 })
    }
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch EPGs from APIC' },
      { status: 502 },
    )
  }

  await recordAudit({
    userId: session.user.id,
    userName: session.user.username ?? session.user.name,
    action: 'resync.epgs',
    target: `${apicHost.name} (${apicHost.host})`,
    detail: `synced ${result.syncedEpgs} EPGs (${result.syncedBindings} bindings)`,
  })

  return Response.json(result)
}
