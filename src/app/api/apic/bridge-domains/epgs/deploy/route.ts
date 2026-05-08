import { deployEpgOnlyRows } from '@/lib/apic/epgs/apic'
import type { ParsedEpgRow } from '@/lib/apic/epgs/types'

export async function POST(request: Request): Promise<Response> {
  let rows: ParsedEpgRow[], apicHost: string, apicToken: string
  try {
    ;({ rows, apicHost, apicToken } = await request.json())
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!Array.isArray(rows)) {
    return Response.json({ error: 'rows is required' }, { status: 400 })
  }
  if (!apicHost || !apicToken) {
    return Response.json({ error: 'apicHost and apicToken are required' }, { status: 400 })
  }

  const results = await deployEpgOnlyRows(rows, apicHost, apicToken)
  return Response.json({ results })
}
