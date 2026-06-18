import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import { resyncInterfaces } from '@/lib/apic/interfaces'

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

  let result: { synced: number; total: number }
  try {
    result = await resyncInterfaces({
      apicHostId,
      host: apicHost.host,
      username: username.trim(),
      password,
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch interfaces from APIC' },
      { status: 502 },
    )
  }

  await recordAudit({
    userId: session.user.id,
    userName: session.user.username ?? session.user.name,
    action: 'resync.interfaces',
    target: `${apicHost.name} (${apicHost.host})`,
    detail: `synced ${result.synced} (total ${result.total})`,
  })

  return Response.json(result)
}
