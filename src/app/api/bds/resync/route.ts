import { z } from 'zod'
import { resyncBdInventory } from '@/lib/bds/mutation'

const schema = z.object({
  apicHostId: z.string().trim().min(1),
  username: z.string().trim().min(1),
  password: z.string().min(1),
})
const STATUS = {
  unauthorized: 401,
  'host-not-found': 404,
  'in-progress': 409,
  'sync-failed': 502,
} as const
export async function POST(request: Request) {
  const input = schema.safeParse(await request.json().catch(() => null))
  if (!input.success)
    return Response.json(
      { error: 'APIC host, username and password are required' },
      { status: 400 },
    )
  try {
    const result = await resyncBdInventory(input.data)
    return result.ok
      ? Response.json({ syncedBds: result.syncedBds })
      : Response.json({ error: result.error }, { status: STATUS[result.code] })
  } catch {
    return Response.json({ error: 'Failed to finalize Bridge Domain resync' }, { status: 500 })
  }
}
