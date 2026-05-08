import { apicFetch } from '@/lib/apic/client'
import { runParallel } from '@/lib/apic/parallel'
import {
  buildAppProfilePath,
  buildBridgeDomainPath,
  buildContractRelationPath,
  buildContractPath,
  buildEpgChildrenPath,
  buildEpgPath,
  buildTenantPath,
  contractAttachmentPayload,
  contractRelationDeletePayload,
  epgDeletePayload,
  epgPayload,
} from './paths'
import {
  epgBridgeDomainName,
  hasRoleContract,
  validateEpgState,
  type EpgChild,
} from './rollback'
import type {
  ParsedAnyEpgRow,
  EpgContractRole,
  EpgDeployResult,
  EpgValidationResult,
  ParsedEpgContractRow,
  ParsedEpgRow,
} from './types'

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

async function readEpgChildren(
  host: string,
  token: string,
  row: ParsedAnyEpgRow,
): Promise<{ children?: EpgChild[]; error?: string }> {
  const childrenRes = await apicFetch(host, buildEpgChildrenPath(row), { token })
  if (!childrenRes.ok) {
    const text = await childrenRes.text()
    return { error: `EPG children check failed (APIC ${childrenRes.status}): ${text.slice(0, 200)}` }
  }
  const childrenData = await childrenRes.json() as { imdata: EpgChild[] }
  return { children: childrenData.imdata }
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

function epgGroupKey(row: ParsedEpgContractRow): string {
  return `${row.tenant}|${row.anp}|${row.epg}|${row.bd}`
}

export async function validateEpgOnlyDeployRows(
  rows: ParsedEpgRow[],
  apicHost: string,
  apicToken: string,
): Promise<EpgValidationResult[]> {
  return runParallel<ParsedEpgRow, EpgValidationResult>(rows, 10, async (row) => {
    try {
      const tenant = await moExists(apicHost, buildTenantPath(row.tenant), apicToken)
      if (tenant.error) return { rowIndex: row.rowIndex, status: 'error', message: `Tenant check failed: ${tenant.error}` }
      if (!tenant.exists) return { rowIndex: row.rowIndex, status: 'error', message: `Tenant not found: ${row.tenant}` }

      const anp = await moExists(apicHost, buildAppProfilePath(row.tenant, row.anp), apicToken)
      if (anp.error) return { rowIndex: row.rowIndex, status: 'error', message: `ANP check failed: ${anp.error}` }
      if (!anp.exists) return { rowIndex: row.rowIndex, status: 'error', message: `ANP not found: ${row.tenant}/${row.anp}` }

      const bd = await moExists(apicHost, buildBridgeDomainPath(row.tenant, row.bd), apicToken)
      if (bd.error) return { rowIndex: row.rowIndex, status: 'error', message: `Bridge domain check failed: ${bd.error}` }
      if (!bd.exists) return { rowIndex: row.rowIndex, status: 'error', message: `Bridge domain not found: ${row.tenant}/${row.bd}` }

      const epg = await moExists(apicHost, buildEpgPath(row), apicToken)
      if (epg.error) return { rowIndex: row.rowIndex, status: 'error', message: `EPG check failed: ${epg.error}` }
      if (!epg.exists) return { rowIndex: row.rowIndex, status: 'deploy' }

      const childrenState = await readEpgChildren(apicHost, apicToken, row)
      if (childrenState.error) return { rowIndex: row.rowIndex, status: 'error', message: childrenState.error }
      const mismatch = validateEpgState(row, childrenState.children ?? [])
      if (mismatch) return { rowIndex: row.rowIndex, status: 'error', message: mismatch }

      return { rowIndex: row.rowIndex, status: 'exists' }
    } catch (err) {
      return {
        rowIndex: row.rowIndex,
        status: 'error',
        message: err instanceof Error ? err.message : 'Network error',
      }
    }
  })
}

export async function validateEpgDeployRows(
  rows: ParsedEpgContractRow[],
  apicHost: string,
  apicToken: string,
  role: EpgContractRole,
): Promise<EpgValidationResult[]> {
  return runParallel<ParsedEpgContractRow, EpgValidationResult>(rows, 10, async (row) => {
    try {
      const tenant = await moExists(apicHost, buildTenantPath(row.tenant), apicToken)
      if (tenant.error) return { rowIndex: row.rowIndex, status: 'error', message: `Tenant check failed: ${tenant.error}` }
      if (!tenant.exists) return { rowIndex: row.rowIndex, status: 'error', message: `Tenant not found: ${row.tenant}` }

      const anp = await moExists(apicHost, buildAppProfilePath(row.tenant, row.anp), apicToken)
      if (anp.error) return { rowIndex: row.rowIndex, status: 'error', message: `ANP check failed: ${anp.error}` }
      if (!anp.exists) return { rowIndex: row.rowIndex, status: 'error', message: `ANP not found: ${row.tenant}/${row.anp}` }

      const bd = await moExists(apicHost, buildBridgeDomainPath(row.tenant, row.bd), apicToken)
      if (bd.error) return { rowIndex: row.rowIndex, status: 'error', message: `Bridge domain check failed: ${bd.error}` }
      if (!bd.exists) return { rowIndex: row.rowIndex, status: 'error', message: `Bridge domain not found: ${row.tenant}/${row.bd}` }

      const contract = await moExists(apicHost, buildContractPath(row.tenant, row.contract), apicToken)
      if (contract.error) return { rowIndex: row.rowIndex, status: 'error', message: `Contract check failed: ${contract.error}` }
      if (!contract.exists) return { rowIndex: row.rowIndex, status: 'error', message: `Contract not found: ${row.tenant}/${row.contract}` }

      const epg = await moExists(apicHost, buildEpgPath(row), apicToken)
      if (epg.error) return { rowIndex: row.rowIndex, status: 'error', message: `EPG check failed: ${epg.error}` }
      if (!epg.exists) return { rowIndex: row.rowIndex, status: 'deploy' }

      const childrenState = await readEpgChildren(apicHost, apicToken, row)
      if (childrenState.error) return { rowIndex: row.rowIndex, status: 'error', message: childrenState.error }
      const children = childrenState.children ?? []
      const existingBd = epgBridgeDomainName(children)
      if (existingBd && existingBd !== row.bd) {
        return {
          rowIndex: row.rowIndex,
          status: 'error',
          message: `EPG ${row.tenant}/${row.anp}/${row.epg} already exists with BD ${existingBd}`,
        }
      }

      const contractAttached = hasRoleContract(children, row.contract, role)
      return {
        rowIndex: row.rowIndex,
        status: existingBd === row.bd && contractAttached ? 'exists' : 'deploy',
        message: existingBd === row.bd && contractAttached
          ? undefined
          : `EPG exists; missing BD and/or ${role === 'consumer' ? 'consumed' : 'provided'} contract will be updated`,
      }
    } catch (err) {
      return {
        rowIndex: row.rowIndex,
        status: 'error',
        message: err instanceof Error ? err.message : 'Network error',
      }
    }
  })
}

export async function deployEpgOnlyRows(
  rows: ParsedEpgRow[],
  apicHost: string,
  apicToken: string,
): Promise<EpgDeployResult[]> {
  return runParallel<ParsedEpgRow, EpgDeployResult>(rows, 5, async (row) => {
    try {
      const epgError = await postApic(apicHost, buildEpgPath(row), epgPayload(row), apicToken, 'EPG deploy')
      if (epgError) return { rowIndex: row.rowIndex, success: false, message: epgError }

      return { rowIndex: row.rowIndex, success: true }
    } catch (err) {
      return {
        rowIndex: row.rowIndex,
        success: false,
        message: err instanceof Error ? err.message : 'Network error',
      }
    }
  })
}

export async function deployEpgRows(
  rows: ParsedEpgContractRow[],
  apicHost: string,
  apicToken: string,
  role: EpgContractRole,
): Promise<EpgDeployResult[]> {
  const groups = Array.from(
    rows.reduce((map, row) => {
      const key = epgGroupKey(row)
      const group = map.get(key)
      if (group) {
        group.push(row)
      } else {
        map.set(key, [row])
      }
      return map
    }, new Map<string, ParsedEpgContractRow[]>()).values()
  )

  const groupedResults = await runParallel<ParsedEpgContractRow[], EpgDeployResult[]>(groups, 5, async (group) => {
    const [firstRow] = group
    try {
      const epgPath = buildEpgPath(firstRow)
      const epgError = await postApic(apicHost, epgPath, epgPayload(firstRow), apicToken, 'EPG deploy')
      if (epgError) {
        return group.map(row => ({ rowIndex: row.rowIndex, success: false, message: epgError }))
      }

      const results: EpgDeployResult[] = []
      for (const row of group) {
        const relationError = await postApic(
          apicHost,
          epgPath,
          contractAttachmentPayload(row, role),
          apicToken,
          role === 'consumer' ? 'Consumed contract attachment' : 'Provided contract attachment',
        )
        results.push(relationError
          ? { rowIndex: row.rowIndex, success: false, message: relationError }
          : { rowIndex: row.rowIndex, success: true }
        )
      }

      return results
    } catch (err) {
      return group.map(row => ({
        rowIndex: row.rowIndex,
        success: false,
        message: err instanceof Error ? err.message : 'Network error',
      }))
    }
  })

  const resultMap = new Map(groupedResults.flat().map(result => [result.rowIndex, result]))
  return rows.map(row => resultMap.get(row.rowIndex) ?? {
    rowIndex: row.rowIndex,
    success: false,
    message: 'Deploy result missing',
  })
}

export async function validateEpgRollbackRows(
  rows: ParsedEpgRow[],
  apicHost: string,
  apicToken: string,
): Promise<EpgValidationResult[]> {
  return runParallel<ParsedEpgRow, EpgValidationResult>(rows, 10, async (row) => {
    try {
      const epg = await moExists(apicHost, buildEpgPath(row), apicToken)
      if (epg.error) return { rowIndex: row.rowIndex, status: 'error', message: `EPG check failed: ${epg.error}` }
      if (!epg.exists) return { rowIndex: row.rowIndex, status: 'missing' }

      const childrenState = await readEpgChildren(apicHost, apicToken, row)
      if (childrenState.error) return { rowIndex: row.rowIndex, status: 'error', message: childrenState.error }

      const mismatch = validateEpgState(row, childrenState.children ?? [])
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
}

export async function rollbackEpgRows(
  rows: ParsedEpgRow[],
  apicHost: string,
  apicToken: string,
): Promise<EpgDeployResult[]> {
  return runParallel<ParsedEpgRow, EpgDeployResult>(rows, 5, async (row) => {
    try {
      const res = await apicFetch(apicHost, buildEpgPath(row), {
        method: 'POST',
        body: epgDeletePayload(row),
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
}

export async function validateEpgContractRollbackRows(
  rows: ParsedEpgContractRow[],
  apicHost: string,
  apicToken: string,
  role: EpgContractRole,
): Promise<EpgValidationResult[]> {
  return runParallel<ParsedEpgContractRow, EpgValidationResult>(rows, 10, async (row) => {
    try {
      const epg = await moExists(apicHost, buildEpgPath(row), apicToken)
      if (epg.error) return { rowIndex: row.rowIndex, status: 'error', message: `EPG check failed: ${epg.error}` }
      if (!epg.exists) return { rowIndex: row.rowIndex, status: 'missing' }

      const childrenState = await readEpgChildren(apicHost, apicToken, row)
      if (childrenState.error) return { rowIndex: row.rowIndex, status: 'error', message: childrenState.error }
      const children = childrenState.children ?? []

      const stateError = validateEpgState(row, children)
      if (stateError) return { rowIndex: row.rowIndex, status: 'error', message: stateError }

      if (!hasRoleContract(children, row.contract, role)) {
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
}

export async function rollbackEpgContractRows(
  rows: ParsedEpgContractRow[],
  apicHost: string,
  apicToken: string,
  role: EpgContractRole,
): Promise<EpgDeployResult[]> {
  return runParallel<ParsedEpgContractRow, EpgDeployResult>(rows, 5, async (row) => {
    try {
      const res = await apicFetch(apicHost, buildContractRelationPath(row, role), {
        method: 'POST',
        body: contractRelationDeletePayload(row, role),
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
}
