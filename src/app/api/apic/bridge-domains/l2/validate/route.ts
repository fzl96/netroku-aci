import { apicFetch } from '@/lib/apic/client'
import {
  buildBridgeDomainPath,
  buildTenantPath,
  buildVrfPath,
} from '@/lib/apic/bridge-domains/paths'
import { runParallel } from '@/lib/apic/parallel'
import type {
  BridgeDomainValidationResult,
  ParsedBridgeDomainL2Row,
} from '@/lib/apic/bridge-domains/types'

async function moExists(host: string, path: string, token: string): Promise<{ exists?: boolean; error?: string }> {
  const res = await apicFetch(host, path, { token })
  if (res.status === 404) return { exists: false }
  if (!res.ok) {
    const text = await res.text()
    return { error: `APIC ${res.status}: ${text.slice(0, 200)}` }
  }
  const data = await res.json() as { imdata: unknown[] }
  return { exists: data.imdata.length > 0 }
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
      const tenant = await moExists(apicHost, buildTenantPath(row.tenant), apicToken)
      if (tenant.error) return { rowIndex: row.rowIndex, status: 'error', message: `Tenant check failed: ${tenant.error}` }
      if (!tenant.exists) return { rowIndex: row.rowIndex, status: 'error', message: `Tenant not found: ${row.tenant}` }

      const vrf = await moExists(apicHost, buildVrfPath(row.tenant, row.vrf), apicToken)
      if (vrf.error) return { rowIndex: row.rowIndex, status: 'error', message: `VRF check failed: ${vrf.error}` }
      if (!vrf.exists) return { rowIndex: row.rowIndex, status: 'error', message: `VRF not found: ${row.tenant}/${row.vrf}` }

      const bd = await moExists(apicHost, buildBridgeDomainPath(row.tenant, row.bd), apicToken)
      if (bd.error) return { rowIndex: row.rowIndex, status: 'error', message: `Bridge domain check failed: ${bd.error}` }
      return { rowIndex: row.rowIndex, status: bd.exists ? 'exists' : 'deploy' }
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
