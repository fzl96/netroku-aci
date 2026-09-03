import { resyncEndpointInventory } from '@/lib/endpoints/mutation'

const ERROR_STATUS = {
  unauthorized: 401,
  'host-not-found': 404,
  'in-progress': 409,
  'sync-failed': 502,
} as const

export async function POST(request: Request) {
  let apicHostId: string
  let username: string
  let password: string
  try {
    ;({ apicHostId, username, password } = await request.json())
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!apicHostId) {
    return Response.json({ error: 'apicHostId is required' }, { status: 400 })
  }
  if (!username?.trim() || !password) {
    return Response.json({ error: 'username and password are required' }, { status: 400 })
  }

  try {
    const result = await resyncEndpointInventory({ apicHostId, username, password })
    if (!result.ok) {
      return Response.json(
        { error: result.error },
        { status: ERROR_STATUS[result.code] },
      )
    }
    return Response.json({ synced: result.synced, total: result.total })
  } catch {
    return Response.json({ error: 'Failed to finalize endpoint resync' }, { status: 500 })
  }
}
