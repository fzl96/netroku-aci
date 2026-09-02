import { LEGACY_RANGES } from '@/lib/legacy/query'
import { getLegacyInterfaceHistory, LegacyInterfaceReadError } from '@/lib/legacy/interfaces/query'

function positivePage(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** Read transport for the legacy interface drawer. Detail reads stay a plain
 *  authenticated GET so they are cancellable; mutations remain Server Actions. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const interfaceId = params.get('interfaceId')?.trim()
  const range = params.get('range')

  if (!interfaceId) return Response.json({ error: 'interfaceId is required' }, { status: 400 })
  if (!range || !LEGACY_RANGES.includes(range as (typeof LEGACY_RANGES)[number])) {
    return Response.json({ error: 'Unsupported range' }, { status: 400 })
  }

  try {
    const history = await getLegacyInterfaceHistory(interfaceId, {
      range: range as (typeof LEGACY_RANGES)[number],
      page: positivePage(params.get('page')),
    })
    if (!history) return Response.json({ error: 'Interface not found' }, { status: 404 })
    return Response.json(history)
  } catch (error) {
    if (error instanceof LegacyInterfaceReadError && error.code === 'unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    throw error
  }
}
