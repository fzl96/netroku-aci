import { apicFetch } from '@/lib/apic/client'
import { runParallel } from '@/lib/apic/parallel'
import { createApicReader, type ApicReader } from '@/lib/apic/read-cache'
import {
  buildAppProfilePath,
  buildBridgeDomainPath,
  buildContractRelationPath,
  buildContractPath,
  buildEpgChildrenPath,
  buildEpgPath,
  buildPhysicalDomainPath,
  buildTenantPath,
  contractAttachmentPayload,
  contractRelationDeletePayload,
  epgDeletePayload,
  epgPayload,
  physicalDomainAttachmentPayload,
} from './paths'
import {
  epgBridgeDomainName,
  hasPhysicalDomain,
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
import { effectiveBridgeDomainTenant, effectiveContractTenant } from './types'

async function moExists(reader: ApicReader, path: string): Promise<{ exists?: boolean; error?: string }> {
  const result = await reader.get<{ imdata: unknown[] }>(path)
  if (result.status === 404) return { exists: false }
  if (!result.ok && result.status === 0) throw new Error(result.error)
  if (!result.ok) return { error: `APIC ${result.status}: ${result.error}` }
  return { exists: result.data.imdata.length > 0 }
}

async function readEpgChildren(
  reader: ApicReader,
  row: ParsedAnyEpgRow,
): Promise<{ children?: EpgChild[]; error?: string }> {
  const result = await reader.get<{ imdata: EpgChild[] }>(buildEpgChildrenPath(row))
  if (!result.ok && result.status === 0) throw new Error(result.error)
  if (!result.ok) return { error: `EPG children check failed (APIC ${result.status}): ${result.error}` }
  return { children: result.data.imdata }
}

async function readEpgChildrenDirect(
  host: string,
  token: string,
  row: ParsedAnyEpgRow,
): Promise<{ children?: EpgChild[]; error?: string }> {
  const response = await apicFetch(host, buildEpgChildrenPath(row), { token })
  if (!response.ok) {
    const text = await response.text()
    return { error: `EPG children check failed (APIC ${response.status}): ${text.slice(0, 200)}` }
  }
  const data = await response.json() as { imdata: EpgChild[] }
  return { children: data.imdata }
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

function epgGroupKey(row: ParsedEpgRow): string {
  return `${row.tenant}|${row.anp}|${row.epg}|${effectiveBridgeDomainTenant(row)}|${row.bd}|${row.phys_domain ?? ''}`
}

function legacyContractRowsToEpgRows(rows: ParsedEpgContractRow[], role: EpgContractRole): ParsedEpgRow[] {
  return rows.map(row => ({
    rowIndex: row.rowIndex,
    tenant: row.tenant,
    anp: row.anp,
    epg: row.epg,
    bd: row.bd,
    bd_tenant: row.bd_tenant,
    contract_tenant: row.contract_tenant,
    phys_domain: row.phys_domain,
    epg_desc: row.epg_desc,
    consContracts: role === 'consumer' ? [row.contract] : [],
    provContracts: role === 'provider' ? [row.contract] : [],
  }))
}

async function validateBridgeDomainForEpg(
  row: ParsedEpgRow,
  reader: ApicReader,
): Promise<EpgValidationResult | null> {
  const bdTenant = effectiveBridgeDomainTenant(row)
  const bd = await moExists(reader, buildBridgeDomainPath(bdTenant, row.bd))
  if (bd.error) return { rowIndex: row.rowIndex, status: 'error', message: `Bridge domain check failed: ${bd.error}` }
  if (!bd.exists) return { rowIndex: row.rowIndex, status: 'error', message: `Bridge domain not found: ${bdTenant}/${row.bd}` }

  if (bdTenant === 'common' && row.tenant !== 'common') {
    const localBd = await moExists(reader, buildBridgeDomainPath(row.tenant, row.bd))
    if (localBd.error) return { rowIndex: row.rowIndex, status: 'error', message: `Bridge domain ambiguity check failed: ${localBd.error}` }
    if (localBd.exists) {
      return {
        rowIndex: row.rowIndex,
        status: 'error',
        message: `Bridge domain ${row.bd} exists in both ${row.tenant} and common; remove bd_tenant or rename one BD to avoid ambiguous APIC binding`,
      }
    }
  }

  return null
}

async function validatePhysicalDomainForEpg(
  row: ParsedEpgRow,
  reader: ApicReader,
): Promise<EpgValidationResult | null> {
  if (!row.phys_domain) return null

  const physDomain = await moExists(reader, buildPhysicalDomainPath(row.phys_domain))
  if (physDomain.error) return { rowIndex: row.rowIndex, status: 'error', message: `Physical domain check failed: ${physDomain.error}` }
  if (!physDomain.exists) return { rowIndex: row.rowIndex, status: 'error', message: `Physical domain not found: ${row.phys_domain}` }

  return null
}

async function validateContractForEpg(
  row: ParsedEpgRow,
  contractName: string,
  reader: ApicReader,
): Promise<EpgValidationResult | null> {
  const contractTenant = effectiveContractTenant(row)
  const contract = await moExists(reader, buildContractPath(contractTenant, contractName))
  if (contract.error) return { rowIndex: row.rowIndex, status: 'error', message: `Contract check failed: ${contract.error}` }
  if (!contract.exists) return { rowIndex: row.rowIndex, status: 'error', message: `Contract not found: ${contractTenant}/${contractName}` }

  if (contractTenant === 'common' && row.tenant !== 'common') {
    const localContract = await moExists(reader, buildContractPath(row.tenant, contractName))
    if (localContract.error) return { rowIndex: row.rowIndex, status: 'error', message: `Contract ambiguity check failed: ${localContract.error}` }
    if (localContract.exists) {
      return {
        rowIndex: row.rowIndex,
        status: 'error',
        message: `Contract ${contractName} exists in both ${row.tenant} and common; remove contract_tenant or rename one contract to avoid ambiguous APIC binding`,
      }
    }
  }

  return null
}

function requestedContracts(row: ParsedEpgRow): { role: EpgContractRole; contract: string }[] {
  return [
    ...row.consContracts.map(contract => ({ role: 'consumer' as const, contract })),
    ...row.provContracts.map(contract => ({ role: 'provider' as const, contract })),
  ]
}

function uniqueContracts(row: ParsedEpgRow): string[] {
  return Array.from(new Set([...row.consContracts, ...row.provContracts]))
}

export async function validateEpgOnlyDeployRows(
  rows: ParsedEpgRow[],
  apicHost: string,
  apicToken: string,
  reader: ApicReader = createApicReader(apicHost, apicToken),
): Promise<EpgValidationResult[]> {
  return runParallel<ParsedEpgRow, EpgValidationResult>(rows, 10, async (row) => {
    try {
      const tenant = await moExists(reader, buildTenantPath(row.tenant))
      if (tenant.error) return { rowIndex: row.rowIndex, status: 'error', message: `Tenant check failed: ${tenant.error}` }
      if (!tenant.exists) return { rowIndex: row.rowIndex, status: 'error', message: `Tenant not found: ${row.tenant}` }

      const anp = await moExists(reader, buildAppProfilePath(row.tenant, row.anp))
      if (anp.error) return { rowIndex: row.rowIndex, status: 'error', message: `ANP check failed: ${anp.error}` }
      if (!anp.exists) return { rowIndex: row.rowIndex, status: 'error', message: `ANP not found: ${row.tenant}/${row.anp}` }

      const bdError = await validateBridgeDomainForEpg(row, reader)
      if (bdError) return bdError

      const physDomainError = await validatePhysicalDomainForEpg(row, reader)
      if (physDomainError) return physDomainError

      const epg = await moExists(reader, buildEpgPath(row))
      if (epg.error) return { rowIndex: row.rowIndex, status: 'error', message: `EPG check failed: ${epg.error}` }
      if (!epg.exists) return { rowIndex: row.rowIndex, status: 'deploy' }

      const childrenState = await readEpgChildren(reader, row)
      if (childrenState.error) return { rowIndex: row.rowIndex, status: 'error', message: childrenState.error }
      const mismatch = validateEpgState(row, childrenState.children ?? [])
      if (mismatch) return { rowIndex: row.rowIndex, status: 'error', message: mismatch }

      if (row.phys_domain && !hasPhysicalDomain(childrenState.children ?? [], row.phys_domain)) {
        return { rowIndex: row.rowIndex, status: 'deploy', message: 'EPG exists; missing physical domain relation will be updated' }
      }

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
  rows: ParsedEpgRow[],
  apicHost: string,
  apicToken: string,
  reader: ApicReader = createApicReader(apicHost, apicToken),
): Promise<EpgValidationResult[]> {
  return runParallel<ParsedEpgRow, EpgValidationResult>(rows, 10, async (row) => {
    try {
      const tenant = await moExists(reader, buildTenantPath(row.tenant))
      if (tenant.error) return { rowIndex: row.rowIndex, status: 'error', message: `Tenant check failed: ${tenant.error}` }
      if (!tenant.exists) return { rowIndex: row.rowIndex, status: 'error', message: `Tenant not found: ${row.tenant}` }

      const anp = await moExists(reader, buildAppProfilePath(row.tenant, row.anp))
      if (anp.error) return { rowIndex: row.rowIndex, status: 'error', message: `ANP check failed: ${anp.error}` }
      if (!anp.exists) return { rowIndex: row.rowIndex, status: 'error', message: `ANP not found: ${row.tenant}/${row.anp}` }

      const bdError = await validateBridgeDomainForEpg(row, reader)
      if (bdError) return bdError

      const physDomainError = await validatePhysicalDomainForEpg(row, reader)
      if (physDomainError) return physDomainError

      for (const contractName of uniqueContracts(row)) {
        const contractError = await validateContractForEpg(row, contractName, reader)
        if (contractError) return contractError
      }

      const epg = await moExists(reader, buildEpgPath(row))
      if (epg.error) return { rowIndex: row.rowIndex, status: 'error', message: `EPG check failed: ${epg.error}` }
      if (!epg.exists) return { rowIndex: row.rowIndex, status: 'deploy' }

      const childrenState = await readEpgChildren(reader, row)
      if (childrenState.error) return { rowIndex: row.rowIndex, status: 'error', message: childrenState.error }
      const children = childrenState.children ?? []
      const existingBd = epgBridgeDomainName(children)
      const missingPhysicalDomain = row.phys_domain && !hasPhysicalDomain(children, row.phys_domain)
      if (existingBd && existingBd !== row.bd) {
        return {
          rowIndex: row.rowIndex,
          status: 'error',
          message: `EPG ${row.tenant}/${row.anp}/${row.epg} already exists with BD ${existingBd}`,
        }
      }

      const missingContracts = requestedContracts(row).filter(item =>
        !hasRoleContract(children, item.contract, item.role, effectiveContractTenant(row))
      )
      return {
        rowIndex: row.rowIndex,
        status: existingBd === row.bd && missingContracts.length === 0 && !missingPhysicalDomain ? 'exists' : 'deploy',
        message: existingBd === row.bd && missingContracts.length === 0 && !missingPhysicalDomain
          ? undefined
          : 'EPG exists; missing contract or physical domain relations will be updated',
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

      if (row.phys_domain) {
        const physDomainError = await postApic(
          apicHost,
          buildEpgPath(row),
          physicalDomainAttachmentPayload(row.phys_domain),
          apicToken,
          'Physical domain attachment',
        )
        if (physDomainError) return { rowIndex: row.rowIndex, success: false, message: physDomainError }
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

export async function deployEpgRows(
  rows: ParsedEpgRow[],
  apicHost: string,
  apicToken: string,
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
    }, new Map<string, ParsedEpgRow[]>()).values()
  )

  const groupedResults = await runParallel<ParsedEpgRow[], EpgDeployResult[]>(groups, 5, async (group) => {
    const [firstRow] = group
    try {
      const epgPath = buildEpgPath(firstRow)
      const epgError = await postApic(apicHost, epgPath, epgPayload(firstRow), apicToken, 'EPG deploy')
      if (epgError) {
        return group.map(row => ({ rowIndex: row.rowIndex, success: false, message: epgError }))
      }

      if (firstRow.phys_domain) {
        const physDomainError = await postApic(
          apicHost,
          epgPath,
          physicalDomainAttachmentPayload(firstRow.phys_domain),
          apicToken,
          'Physical domain attachment',
        )
        if (physDomainError) {
          return group.map(row => ({ rowIndex: row.rowIndex, success: false, message: physDomainError }))
        }
      }

      const results: EpgDeployResult[] = []
      for (const row of group) {
        const errors: string[] = []
        for (const { role, contract } of requestedContracts(row)) {
          const relationError = await postApic(
            apicHost,
            epgPath,
            contractAttachmentPayload(row, role, contract),
            apicToken,
            role === 'consumer' ? 'Consumed contract attachment' : 'Provided contract attachment',
          )
          if (relationError) errors.push(relationError)
        }
        results.push(errors.length > 0
          ? { rowIndex: row.rowIndex, success: false, message: errors.join('; ') }
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

export async function validateLegacyEpgContractDeployRows(
  rows: ParsedEpgContractRow[],
  apicHost: string,
  apicToken: string,
  role: EpgContractRole,
): Promise<EpgValidationResult[]> {
  return validateEpgDeployRows(legacyContractRowsToEpgRows(rows, role), apicHost, apicToken)
}

export async function deployLegacyEpgContractRows(
  rows: ParsedEpgContractRow[],
  apicHost: string,
  apicToken: string,
  role: EpgContractRole,
): Promise<EpgDeployResult[]> {
  return deployEpgRows(legacyContractRowsToEpgRows(rows, role), apicHost, apicToken)
}

export async function validateEpgRollbackRows(
  rows: ParsedEpgRow[],
  apicHost: string,
  apicToken: string,
  reader: ApicReader = createApicReader(apicHost, apicToken),
): Promise<EpgValidationResult[]> {
  return runParallel<ParsedEpgRow, EpgValidationResult>(rows, 10, async (row) => {
    try {
      const epg = await moExists(reader, buildEpgPath(row))
      if (epg.error) return { rowIndex: row.rowIndex, status: 'error', message: `EPG check failed: ${epg.error}` }
      if (!epg.exists) return { rowIndex: row.rowIndex, status: 'missing' }

      const childrenState = await readEpgChildren(reader, row)
      if (childrenState.error) return { rowIndex: row.rowIndex, status: 'error', message: childrenState.error }

      const children = childrenState.children ?? []
      const mismatch = validateEpgState(row, children)
      if (mismatch) return { rowIndex: row.rowIndex, status: 'error', message: mismatch }

      const contracts = requestedContracts(row)
      if (contracts.length > 0) {
        const existingContracts = contracts.filter(item =>
          hasRoleContract(children, item.contract, item.role, effectiveContractTenant(row))
        )
        return { rowIndex: row.rowIndex, status: existingContracts.length > 0 ? 'rollback' : 'missing' }
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

export async function rollbackEpgRows(
  rows: ParsedEpgRow[],
  apicHost: string,
  apicToken: string,
): Promise<EpgDeployResult[]> {
  return runParallel<ParsedEpgRow, EpgDeployResult>(rows, 5, async (row) => {
    try {
      const contracts = requestedContracts(row)
      if (contracts.length > 0) {
        const childrenState = await readEpgChildrenDirect(apicHost, apicToken, row)
        if (childrenState.error) return { rowIndex: row.rowIndex, success: false, message: childrenState.error }
        const children = childrenState.children ?? []
        const mismatch = validateEpgState(row, children)
        if (mismatch) return { rowIndex: row.rowIndex, success: false, message: mismatch }

        const errors: string[] = []
        for (const { role, contract } of contracts) {
          if (!hasRoleContract(children, contract, role, effectiveContractTenant(row))) continue
          const res = await apicFetch(apicHost, buildContractRelationPath(row, role, contract), {
            method: 'POST',
            body: contractRelationDeletePayload(row, role, contract),
            token: apicToken,
          })
          if (!res.ok) {
            const text = await res.text()
            errors.push(`${role} contract ${contract} failed (APIC ${res.status}): ${text.slice(0, 200)}`)
          }
        }

        return errors.length > 0
          ? { rowIndex: row.rowIndex, success: false, message: errors.join('; ') }
          : { rowIndex: row.rowIndex, success: true }
      }

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
  return validateEpgRollbackRows(legacyContractRowsToEpgRows(rows, role), apicHost, apicToken)
}

export async function rollbackEpgContractRows(
  rows: ParsedEpgContractRow[],
  apicHost: string,
  apicToken: string,
  role: EpgContractRole,
): Promise<EpgDeployResult[]> {
  return rollbackEpgRows(legacyContractRowsToEpgRows(rows, role), apicHost, apicToken)
}
