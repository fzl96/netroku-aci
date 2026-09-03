import { ERROR_TREND_RANGES, type ErrorTrendRange } from '@/lib/interface-health/error-trend'
import {
  getInterfaceErrorSamples,
  getInterfaceStatusDetails,
  InterfaceReadError,
} from '@/lib/interface-health/query'

const RANGES = new Set<string>(ERROR_TREND_RANGES.map(range => range.value))

/** Read transport for the interface drawer. Detail reads stay a plain
 *  authenticated GET so they are cacheable and cancellable; mutations remain
 *  Server Actions. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const kind = params.get('kind')
  const interfaceId = params.get('interfaceId')?.trim()
  const range = params.get('range')

  if (!interfaceId) return Response.json({ error: 'interfaceId is required' }, { status: 400 })
  if (!range || !RANGES.has(range)) {
    return Response.json({ error: 'Unsupported range' }, { status: 400 })
  }
  if (kind !== 'errors' && kind !== 'status') {
    return Response.json({ error: 'Unsupported kind' }, { status: 400 })
  }

  try {
    if (kind === 'errors') {
      return Response.json(await getInterfaceErrorSamples(interfaceId, range as ErrorTrendRange))
    }
    const details = await getInterfaceStatusDetails(interfaceId, range as ErrorTrendRange)
    if (!details) return Response.json({ error: 'Interface not found' }, { status: 404 })
    return Response.json(details)
  } catch (error) {
    if (error instanceof InterfaceReadError) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    throw error
  }
}
