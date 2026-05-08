import { apicFetch } from '@/lib/apic/client'
import {
  buildBridgeDomainChildrenPath,
  buildBridgeDomainPath,
  buildL3OutPath,
  buildTenantPath,
  buildVrfPath,
} from '@/lib/apic/bridge-domains/paths'
import { runParallel } from '@/lib/apic/parallel'
import type {
  BridgeDomainValidationResult,
  ParsedBridgeDomainL3Row,
} from '@/lib/apic/bridge-domains/types'

type BdChild =
  | { fvSubnet: { attributes: { ip?: string } } }
  | { fvRsBDToOut: { attributes: { tnL3extOutName?: string } } }
  | { fvRsCtx: { attributes: { tnFvCtxName?: string; tDn?: string } } }

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
  let rows: ParsedBridgeDomainL3Row[], apicHost: string, apicToken: string
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

  const results = await runParallel<ParsedBridgeDomainL3Row, BridgeDomainValidationResult>(rows, 10, async (row) => {
    try {
      const tenant = await moExists(apicHost, buildTenantPath(row.tenant), apicToken)
      if (tenant.error) return { rowIndex: row.rowIndex, status: 'error', message: `Tenant check failed: ${tenant.error}` }
      if (!tenant.exists) return { rowIndex: row.rowIndex, status: 'error', message: `Tenant not found: ${row.tenant}` }

      const vrf = await moExists(apicHost, buildVrfPath(row.tenant, row.vrf), apicToken)
      if (vrf.error) return { rowIndex: row.rowIndex, status: 'error', message: `VRF check failed: ${vrf.error}` }
      if (!vrf.exists) return { rowIndex: row.rowIndex, status: 'error', message: `VRF not found: ${row.tenant}/${row.vrf}` }

      const l3out = await moExists(apicHost, buildL3OutPath(row.tenant, row.l3out), apicToken)
      if (l3out.error) return { rowIndex: row.rowIndex, status: 'error', message: `L3Out check failed: ${l3out.error}` }
      if (!l3out.exists) return { rowIndex: row.rowIndex, status: 'error', message: `L3Out not found: ${row.tenant}/${row.l3out}` }

      const bd = await moExists(apicHost, buildBridgeDomainPath(row.tenant, row.bd), apicToken)
      if (bd.error) return { rowIndex: row.rowIndex, status: 'error', message: `Bridge domain check failed: ${bd.error}` }
      if (!bd.exists) return { rowIndex: row.rowIndex, status: 'deploy' }

      const childrenRes = await apicFetch(apicHost, buildBridgeDomainChildrenPath(row.tenant, row.bd), { token: apicToken })
      if (!childrenRes.ok) {
        const text = await childrenRes.text()
        return { rowIndex: row.rowIndex, status: 'error', message: `Bridge domain children check failed (APIC ${childrenRes.status}): ${text.slice(0, 200)}` }
      }
      const childrenData = await childrenRes.json() as { imdata: BdChild[] }
      const children = childrenData.imdata

      const ctx = children.find((item): item is { fvRsCtx: { attributes: { tnFvCtxName?: string; tDn?: string } } } => 'fvRsCtx' in item)
      const existingVrf = ctx?.fvRsCtx.attributes.tnFvCtxName ?? ctx?.fvRsCtx.attributes.tDn?.split('/ctx-')[1]
      if (existingVrf && existingVrf !== row.vrf) {
        return {
          rowIndex: row.rowIndex,
          status: 'error',
          message: `Bridge domain ${row.tenant}/${row.bd} already exists with VRF ${existingVrf}`,
        }
      }

      const subnetExists = children.some((item) =>
        'fvSubnet' in item && item.fvSubnet.attributes.ip === row.subnet
      )
      const l3outAttached = children.some((item) =>
        'fvRsBDToOut' in item && item.fvRsBDToOut.attributes.tnL3extOutName === row.l3out
      )

      return {
        rowIndex: row.rowIndex,
        status: subnetExists && l3outAttached ? 'exists' : 'deploy',
        message: subnetExists && l3outAttached ? undefined : 'Bridge domain exists; missing subnet and/or L3Out attachment will be updated',
      }
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
