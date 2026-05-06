// src/app/api/apic/rollback/route.ts
import { apicFetch } from '@/lib/apic/client'
import { buildMoPath, buildPathSegment } from '@/lib/apic/paths'
import { runParallel } from '@/lib/apic/parallel'
import type { ParsedRow, DeployResult } from '@/lib/apic/types'

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

  const results = await runParallel<ParsedRow, DeployResult>(rows, 5, async (row) => {
    const moPath = buildMoPath(row)
    const pathSeg = buildPathSegment(row)
    const dn = `uni/tn-${row.tenant}/ap-${row.ap}/epg-${row.epg}/rspathAtt-[${pathSeg}]`

    // APIC accepts "soft delete" by POSTing the MO with status=deleted; this is
    // more reliable across APIC versions than HTTP DELETE on the MO URL.
    const payload = JSON.stringify({
      fvRsPathAtt: {
        attributes: {
          dn,
          status: 'deleted',
        },
      },
    })

    try {
      const res = await apicFetch(host, moPath, { method: 'POST', body: payload, token })

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
