import { apicFetch } from '@/lib/apic/client'
import {
  buildBridgeDomainChildrenPath,
  buildBridgeDomainPath,
} from '@/lib/apic/bridge-domains/paths'
import {
  validateL2RollbackState,
  type BridgeDomainAttrs,
  type BridgeDomainChild,
} from '@/lib/apic/bridge-domains/rollback'
import { runParallel } from '@/lib/apic/parallel'
import type {
  BridgeDomainValidationResult,
  ParsedBridgeDomainL2Row,
} from '@/lib/apic/bridge-domains/types'

async function readBridgeDomain(
  host: string,
  token: string,
  row: ParsedBridgeDomainL2Row,
): Promise<
  | { exists: false }
  | { exists: true; attrs: BridgeDomainAttrs; children: BridgeDomainChild[] }
  | { error: string }
> {
  const bdRes = await apicFetch(host, buildBridgeDomainPath(row.tenant, row.bd), { token })
  if (bdRes.status === 404) return { exists: false }
  if (!bdRes.ok) {
    const text = await bdRes.text()
    return { error: `Bridge domain check failed (APIC ${bdRes.status}): ${text.slice(0, 200)}` }
  }

  const bdData = await bdRes.json() as { imdata: { fvBD?: { attributes: BridgeDomainAttrs } }[] }
  const attrs = bdData.imdata[0]?.fvBD?.attributes
  if (!attrs) return { exists: false }

  const childrenRes = await apicFetch(host, buildBridgeDomainChildrenPath(row.tenant, row.bd), { token })
  if (!childrenRes.ok) {
    const text = await childrenRes.text()
    return { error: `Bridge domain children check failed (APIC ${childrenRes.status}): ${text.slice(0, 200)}` }
  }

  const childrenData = await childrenRes.json() as { imdata: BridgeDomainChild[] }
  return { exists: true, attrs, children: childrenData.imdata }
}

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

  const results = await runParallel<ParsedBridgeDomainL2Row, BridgeDomainValidationResult>(rows, 10, async (row) => {
    try {
      const state = await readBridgeDomain(apicHost, apicToken, row)
      if ('error' in state) return { rowIndex: row.rowIndex, status: 'error', message: state.error }
      if (!state.exists) return { rowIndex: row.rowIndex, status: 'missing' }

      const mismatch = validateL2RollbackState(row, state.attrs, state.children)
      if (mismatch) return { rowIndex: row.rowIndex, status: 'error', message: mismatch }

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
