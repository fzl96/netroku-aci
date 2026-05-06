// src/app/api/apic/validate-rollback/route.ts
import { apicFetch } from '@/lib/apic/client'
import { buildMoPath } from '@/lib/apic/paths'
import { runParallel } from '@/lib/apic/parallel'
import type { ParsedRow, ValidationResult } from '@/lib/apic/types'

export async function POST(request: Request): Promise<Response> {
  let rows: ParsedRow[], apicHost: string, apicToken: string
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

  const results = await runParallel<ParsedRow, ValidationResult>(rows, 10, async (row) => {
    try {
      // Rollback only needs to know whether the binding currently exists.
      // EPG / node / port / encap pre-checks are intentionally skipped — those
      // resources may already be partially cleaned up, and we only care about
      // the static port binding itself.
      const res = await apicFetch(host, buildMoPath(row), { token })
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
