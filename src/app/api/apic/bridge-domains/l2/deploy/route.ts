import { apicFetch } from '@/lib/apic/client'
import {
  bridgeDomainL2Payload,
  buildBridgeDomainPath,
} from '@/lib/apic/bridge-domains/paths'
import { runParallel } from '@/lib/apic/parallel'
import type {
  BridgeDomainDeployResult,
  ParsedBridgeDomainL2Row,
} from '@/lib/apic/bridge-domains/types'

export async function POST(request: Request): Promise<Response> {
  let rows: ParsedBridgeDomainL2Row[], apicHost: string, apicToken: string
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

  const results = await runParallel<ParsedBridgeDomainL2Row, BridgeDomainDeployResult>(rows, 5, async (row) => {
    try {
      const res = await apicFetch(apicHost, buildBridgeDomainPath(row.tenant, row.bd), {
        method: 'POST',
        body: bridgeDomainL2Payload(row),
        token: apicToken,
      })
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
