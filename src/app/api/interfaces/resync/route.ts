import { resyncInterfaceInventory } from '@/lib/interface-health/mutation'

export async function POST(request: Request) {
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

  try {
    const result = await resyncInterfaceInventory({ apicHostId, username, password })
    if (!result.ok) {
      const status =
        result.code === 'unauthorized' ? 401 : result.code === 'host-not-found' ? 404 : 502
      return Response.json({ error: result.error }, { status })
    }
    return Response.json({ synced: result.synced, total: result.total })
  } catch {
    return Response.json({ error: 'Failed to finalize interface resync' }, { status: 500 })
  }
}
