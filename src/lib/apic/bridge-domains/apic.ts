import { apicFetch } from '@/lib/apic/client'
import { runParallel } from '@/lib/apic/parallel'
import {
  bridgeDomainDeletePayload,
  bridgeDomainL2Payload,
  bridgeDomainL3Payload,
  buildBridgeDomainChildrenPath,
  buildBridgeDomainPath,
  buildL3OutPath,
  buildSubnetPath,
  buildTenantPath,
  buildVrfPath,
  l3OutAttachmentPayload,
  subnetPayload,
} from './paths'
import {
  validateL2RollbackState,
  validateL3RollbackState,
  type BridgeDomainAttrs,
  type BridgeDomainChild,
} from './rollback'
import type {
  BridgeDomainDeployResult,
  BridgeDomainValidationResult,
  ParsedBridgeDomainL2Row,
  ParsedBridgeDomainL3Row,
} from './types'

async function moExists(
  host: string,
  path: string,
  token: string,
): Promise<{ exists?: boolean; error?: string }> {
  const res = await apicFetch(host, path, { token })
  if (res.status === 404) return { exists: false }
  if (!res.ok) {
    const text = await res.text()
    return { error: `APIC ${res.status}: ${text.slice(0, 200)}` }
  }
  const data = await res.json() as { imdata: unknown[] }
  return { exists: data.imdata.length > 0 }
}

async function postApic(
  host: string,
  path: string,
  body: string,
  token: string,
  stage: string,
): Promise<string | null> {
  const res = await apicFetch(host, path, { method: 'POST', body, token })
  if (res.ok) return null
  const text = await res.text()
  return `${stage} failed (APIC ${res.status}): ${text.slice(0, 200)}`
}

async function readBridgeDomain(
  host: string,
  token: string,
  tenant: string,
  bd: string,
): Promise<{ exists: false } | { exists: true; attrs: BridgeDomainAttrs; children: BridgeDomainChild[] } | { error: string }> {
  const bdRes = await apicFetch(host, buildBridgeDomainPath(tenant, bd), { token })
  if (bdRes.status === 404) return { exists: false }
  if (!bdRes.ok) {
    const text = await bdRes.text()
    return { error: `Bridge domain check failed (APIC ${bdRes.status}): ${text.slice(0, 200)}` }
  }
  const bdData = await bdRes.json() as { imdata: { fvBD?: { attributes: BridgeDomainAttrs } }[] }
  const attrs = bdData.imdata[0]?.fvBD?.attributes
  if (!attrs) return { exists: false }

  const childrenRes = await apicFetch(host, buildBridgeDomainChildrenPath(tenant, bd), { token })
  if (!childrenRes.ok) {
    const text = await childrenRes.text()
    return { error: `Bridge domain children check failed (APIC ${childrenRes.status}): ${text.slice(0, 200)}` }
  }
  const childrenData = await childrenRes.json() as { imdata: BridgeDomainChild[] }
  return { exists: true, attrs, children: childrenData.imdata }
}

export async function validateBridgeDomainL2Rows(
  rows: ParsedBridgeDomainL2Row[],
  apicHost: string,
  apicToken: string,
): Promise<BridgeDomainValidationResult[]> {
  return runParallel<ParsedBridgeDomainL2Row, BridgeDomainValidationResult>(rows, 10, async (row) => {
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
      return { rowIndex: row.rowIndex, status: 'error', message: err instanceof Error ? err.message : 'Network error' }
    }
  })
}

export async function deployBridgeDomainL2Rows(
  rows: ParsedBridgeDomainL2Row[],
  apicHost: string,
  apicToken: string,
): Promise<BridgeDomainDeployResult[]> {
  return runParallel<ParsedBridgeDomainL2Row, BridgeDomainDeployResult>(rows, 5, async (row) => {
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
      return { rowIndex: row.rowIndex, success: false, message: err instanceof Error ? err.message : 'Network error' }
    }
  })
}

export async function rollbackBridgeDomainRows(
  rows: (ParsedBridgeDomainL2Row | ParsedBridgeDomainL3Row)[],
  apicHost: string,
  apicToken: string,
): Promise<BridgeDomainDeployResult[]> {
  return runParallel<ParsedBridgeDomainL2Row | ParsedBridgeDomainL3Row, BridgeDomainDeployResult>(rows, 5, async (row) => {
    try {
      const res = await apicFetch(apicHost, buildBridgeDomainPath(row.tenant, row.bd), {
        method: 'POST',
        body: bridgeDomainDeletePayload(row),
        token: apicToken,
      })
      if (!res.ok) {
        const text = await res.text()
        return { rowIndex: row.rowIndex, success: false, message: `APIC ${res.status}: ${text.slice(0, 200)}` }
      }
      return { rowIndex: row.rowIndex, success: true }
    } catch (err) {
      return { rowIndex: row.rowIndex, success: false, message: err instanceof Error ? err.message : 'Network error' }
    }
  })
}

export async function validateBridgeDomainL2RollbackRows(
  rows: ParsedBridgeDomainL2Row[],
  apicHost: string,
  apicToken: string,
): Promise<BridgeDomainValidationResult[]> {
  return runParallel<ParsedBridgeDomainL2Row, BridgeDomainValidationResult>(rows, 10, async (row) => {
    try {
      const state = await readBridgeDomain(apicHost, apicToken, row.tenant, row.bd)
      if ('error' in state) return { rowIndex: row.rowIndex, status: 'error', message: state.error }
      if (!state.exists) return { rowIndex: row.rowIndex, status: 'missing' }
      const mismatch = validateL2RollbackState(row, state.attrs, state.children)
      if (mismatch) return { rowIndex: row.rowIndex, status: 'error', message: mismatch }
      return { rowIndex: row.rowIndex, status: 'rollback' }
    } catch (err) {
      return { rowIndex: row.rowIndex, status: 'error', message: err instanceof Error ? err.message : 'Network error' }
    }
  })
}

export async function validateBridgeDomainL3Rows(
  rows: ParsedBridgeDomainL3Row[],
  apicHost: string,
  apicToken: string,
): Promise<BridgeDomainValidationResult[]> {
  type BdChild =
    | { fvSubnet: { attributes: { ip?: string } } }
    | { fvRsBDToOut: { attributes: { tnL3extOutName?: string } } }
    | { fvRsCtx: { attributes: { tnFvCtxName?: string; tDn?: string } } }

  return runParallel<ParsedBridgeDomainL3Row, BridgeDomainValidationResult>(rows, 10, async (row) => {
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
        return { rowIndex: row.rowIndex, status: 'error', message: `Bridge domain ${row.tenant}/${row.bd} already exists with VRF ${existingVrf}` }
      }

      const subnetExists = children.some((item) => 'fvSubnet' in item && item.fvSubnet.attributes.ip === row.subnet)
      const l3outAttached = children.some((item) => 'fvRsBDToOut' in item && item.fvRsBDToOut.attributes.tnL3extOutName === row.l3out)

      return {
        rowIndex: row.rowIndex,
        status: subnetExists && l3outAttached ? 'exists' : 'deploy',
        message: subnetExists && l3outAttached ? undefined : 'Bridge domain exists; missing subnet and/or L3Out attachment will be updated',
      }
    } catch (err) {
      return { rowIndex: row.rowIndex, status: 'error', message: err instanceof Error ? err.message : 'Network error' }
    }
  })
}

export async function deployBridgeDomainL3Rows(
  rows: ParsedBridgeDomainL3Row[],
  apicHost: string,
  apicToken: string,
): Promise<BridgeDomainDeployResult[]> {
  return runParallel<ParsedBridgeDomainL3Row, BridgeDomainDeployResult>(rows, 5, async (row) => {
    try {
      const bdPath = buildBridgeDomainPath(row.tenant, row.bd)
      const bdError = await postApic(apicHost, bdPath, bridgeDomainL3Payload(row), apicToken, 'Bridge domain deploy')
      if (bdError) return { rowIndex: row.rowIndex, success: false, message: bdError }

      const subnetError = await postApic(apicHost, buildSubnetPath(row.tenant, row.bd, row.subnet), subnetPayload(row), apicToken, 'Subnet deploy')
      if (subnetError) return { rowIndex: row.rowIndex, success: false, message: subnetError }

      const l3outError = await postApic(apicHost, bdPath, l3OutAttachmentPayload(row), apicToken, 'L3Out attachment')
      if (l3outError) return { rowIndex: row.rowIndex, success: false, message: l3outError }

      return { rowIndex: row.rowIndex, success: true }
    } catch (err) {
      return { rowIndex: row.rowIndex, success: false, message: err instanceof Error ? err.message : 'Network error' }
    }
  })
}

export async function validateBridgeDomainL3RollbackRows(
  rows: ParsedBridgeDomainL3Row[],
  apicHost: string,
  apicToken: string,
): Promise<BridgeDomainValidationResult[]> {
  return runParallel<ParsedBridgeDomainL3Row, BridgeDomainValidationResult>(rows, 10, async (row) => {
    try {
      const state = await readBridgeDomain(apicHost, apicToken, row.tenant, row.bd)
      if ('error' in state) return { rowIndex: row.rowIndex, status: 'error', message: state.error }
      if (!state.exists) return { rowIndex: row.rowIndex, status: 'missing' }
      const mismatch = validateL3RollbackState(row, state.attrs, state.children)
      if (mismatch) return { rowIndex: row.rowIndex, status: 'error', message: mismatch }
      return { rowIndex: row.rowIndex, status: 'rollback' }
    } catch (err) {
      return { rowIndex: row.rowIndex, status: 'error', message: err instanceof Error ? err.message : 'Network error' }
    }
  })
}
