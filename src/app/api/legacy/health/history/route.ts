import { LEGACY_RANGES } from '@/lib/legacy/query'
import { getLegacyHealthHistory, LegacyHealthReadError } from '@/lib/legacy/health/query'

function positivePage(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** Read transport for the legacy health drawer. Detail reads stay a plain
 *  authenticated GET so they are cancellable; mutations remain Server Actions. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const deviceId = params.get('deviceId')?.trim()
  const range = params.get('range')

  if (!deviceId) return Response.json({ error: 'deviceId is required' }, { status: 400 })
  if (!range || !LEGACY_RANGES.includes(range as (typeof LEGACY_RANGES)[number])) {
    return Response.json({ error: 'Unsupported range' }, { status: 400 })
  }

  try {
    const history = await getLegacyHealthHistory(deviceId, {
      range: range as (typeof LEGACY_RANGES)[number],
      samplePage: positivePage(params.get('samplePage')),
      logPage: positivePage(params.get('logPage')),
    })
    if (!history) return Response.json({ error: 'Device not found' }, { status: 404 })
    return Response.json(history)
  } catch (error) {
    if (error instanceof LegacyHealthReadError && error.code === 'unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    throw error
  }
}
