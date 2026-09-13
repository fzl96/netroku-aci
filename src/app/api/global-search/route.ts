import { AuthenticationRequiredError } from '@/lib/auth'
import { searchRecords } from '@/lib/global-search/query'
import { isRecordGroup, MAX_SEARCH_QUERY } from '@/lib/global-search/types'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const query = params.get('query') ?? ''
  const group = params.get('group')
  const headers = { 'Cache-Control': 'private, no-store' }
  if (query.length > MAX_SEARCH_QUERY || (group !== null && !isRecordGroup(group))) {
    return Response.json({ error: 'Invalid search request' }, { status: 400, headers })
  }
  try {
    return Response.json(
      await searchRecords(
        query,
        params.get('history') === 'true',
        group && isRecordGroup(group) ? group : undefined,
      ),
      { headers },
    )
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers })
    }
    return Response.json({ error: 'Search unavailable' }, { status: 503, headers })
  }
}
