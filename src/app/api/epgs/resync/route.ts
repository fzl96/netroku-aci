import { resyncEpgInventory } from '@/lib/epgs/mutation'

const STATUS = {
  unauthorized: 401,
  'host-not-found': 404,
  'in-progress': 409,
  'sync-failed': 502,
} as const
export async function POST(request: Request) {
  let input: { apicHostId: string; username: string; password: string }
  try {
    input = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!input.apicHostId) return Response.json({ error: 'apicHostId is required' }, { status: 400 })
  if (!input.username?.trim() || !input.password)
    return Response.json({ error: 'username and password are required' }, { status: 400 })
  try {
    const result = await resyncEpgInventory(input)
    return result.ok
      ? Response.json({ syncedEpgs: result.syncedEpgs, syncedBindings: result.syncedBindings })
      : Response.json({ error: result.error }, { status: STATUS[result.code] })
  } catch {
    return Response.json({ error: 'Failed to finalize EPG resync' }, { status: 500 })
  }
}
