import { apicFetch } from '@/lib/apic/client'
import { buildSelectorPath } from '@/lib/apic/selectors/paths'
import { runParallel } from '@/lib/apic/parallel'
import type { ParsedSelectorRow, SelectorValidationResult } from '@/lib/apic/selectors/types'

export async function POST(request: Request): Promise<Response> {
  let rows: ParsedSelectorRow[], apicHost: string, apicToken: string
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

  const host = apicHost
  const token = apicToken

  const results = await runParallel<ParsedSelectorRow, SelectorValidationResult>(rows, 10, async (row) => {
    try {
      const res = await apicFetch(host, buildSelectorPath(row.interface_profile, row.selector_name), { token })
      if (res.status === 404) {
        return { rowIndex: row.rowIndex, status: 'missing' }
      }
      if (!res.ok) {
        const text = await res.text()
        return { rowIndex: row.rowIndex, status: 'error', message: `APIC ${res.status}: ${text.slice(0, 200)}` }
      }
      const data = await res.json() as { imdata: unknown[] }
      if (data.imdata.length === 0) {
        return { rowIndex: row.rowIndex, status: 'missing' }
      }
      return { rowIndex: row.rowIndex, status: 'rollback' }
    } catch (err) {
      return {
        rowIndex: row.rowIndex,
        status: 'error',
        message: err instanceof Error ? err.message : 'Network error',
      }
    }
  })

  return Response.json({ results })
}
