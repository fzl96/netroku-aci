import { apicFetch } from '@/lib/apic/client'
import { buildSelectorPath, selectorDeployPayload } from '@/lib/apic/selectors/paths'
import { runParallel } from '@/lib/apic/parallel'
import type { ParsedSelectorRow, SelectorDeployResult } from '@/lib/apic/selectors/types'

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

  const results = await runParallel<ParsedSelectorRow, SelectorDeployResult>(rows, 5, async (row) => {
    const path = buildSelectorPath(row.interface_profile, row.selector_name)
    const payload = selectorDeployPayload(row)

    try {
      const res = await apicFetch(host, path, { method: 'POST', body: payload, token })
      if (!res.ok) {
        const text = await res.text()
        return { rowIndex: row.rowIndex, success: false, message: `APIC ${res.status}: ${text.slice(0, 200)}` }
      }
      return { rowIndex: row.rowIndex, success: true }
    } catch (err) {
      return {
        rowIndex: row.rowIndex,
        success: false,
        message: err instanceof Error ? err.message : 'Network error',
      }
    }
  })

  return Response.json({ results })
}
