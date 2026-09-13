import { apicFetch } from '@/lib/apic/client'
import { runParallel } from '@/lib/apic/parallel'
import { createApicReader, type ApicReader } from '@/lib/apic/read-cache'
import {
  buildAppProfilePath,
  buildBridgeDomainChildrenPath,
  buildContractPath,
  buildEpgChildrenPathFromDn,
  buildEpgPathFromDn,
  buildEpgSelectorClassPath,
  buildEsgChildrenPath,
  buildEsgChildrenPathFromDn,
  buildEsgDn,
  buildEsgPath,
  buildIpSelectorClassPath,
  buildSelectedEpgDn,
  buildTenantPath,
  buildVrfPath,
  contractAttachmentPayload,
  esgDeletePayload,
  esgPayload,
  selectorDeletePayload,
  selectorPayload,
} from './paths'
import {
  esgVrf,
  extraContracts,
  formatContracts,
  hasContract,
  hasSelector,
  parentEsgDn,
  parseIpMatchExpression,
  requestedContracts,
  sameVrf,
  selectorCount,
  validateEsgVrf,
  vrfFromRelation,
  type EsgAttrs,
  type EsgChild,
  type VrfRef,
} from './state'
import {
  effectiveContractTenant,
  type EsgDeployResult,
  type EsgRef,
  type EsgValidationResult,
  type ParsedEsgRow,
  type ParsedEsgSelectorRow,
} from './types'

type EsgState =
  { exists: false } | { exists: true; attrs: EsgAttrs; children: EsgChild[] } | { error: string }

function esgLabel(ref: EsgRef): string {
  return `${ref.tenant}/${ref.anp}/${ref.esg}`
}

function errorResult(rowIndex: number, message: string): EsgValidationResult {
  return { rowIndex, status: 'error', message }
}

function networkMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Network error'
}

async function moExists(
  reader: ApicReader,
  path: string,
): Promise<{ exists?: boolean; error?: string }> {
  const result = await reader.get<{ imdata: unknown[] }>(path)
  if (result.status === 404) return { exists: false }
  if (!result.ok && result.status === 0) throw new Error(result.error)
  if (!result.ok) return { error: `APIC ${result.status}: ${result.error}` }
  return { exists: result.data.imdata.length > 0 }
}

/** Reads a list of objects, throwing on network failure and returning an error string on APIC failure. */
async function readImdata<T>(
  reader: ApicReader,
  path: string,
  stage: string,
): Promise<{ items: T[] } | { error: string }> {
  const result = await reader.get<{ imdata: T[] }>(path)
  if (!result.ok && result.status === 0) throw new Error(result.error)
  if (!result.ok) return { error: `${stage} failed (APIC ${result.status}): ${result.error}` }
  return { items: result.data.imdata }
}

async function readEsg(reader: ApicReader, ref: EsgRef): Promise<EsgState> {
  const esgResult = await reader.get<{ imdata: { fvESg?: { attributes: EsgAttrs } }[] }>(
    buildEsgPath(ref),
  )
  if (esgResult.status === 404) return { exists: false }
  if (!esgResult.ok && esgResult.status === 0) throw new Error(esgResult.error)
  if (!esgResult.ok) {
    return { error: `ESG check failed (APIC ${esgResult.status}): ${esgResult.error}` }
  }
  const attrs = esgResult.data.imdata[0]?.fvESg?.attributes
  if (!attrs) return { exists: false }

  const children = await readImdata<EsgChild>(
    reader,
    buildEsgChildrenPath(ref),
    'ESG children check',
  )
  if ('error' in children) return children
  return { exists: true, attrs, children: children.items }
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

async function checkParent(
  reader: ApicReader,
  row: { rowIndex: number },
  path: string,
  label: string,
  notFound: string,
): Promise<EsgValidationResult | null> {
  const result = await moExists(reader, path)
  if (result.error) return errorResult(row.rowIndex, `${label} check failed: ${result.error}`)
  if (!result.exists) return errorResult(row.rowIndex, `${label} not found: ${notFound}`)
  return null
}

async function validateContract(
  reader: ApicReader,
  row: ParsedEsgRow,
  contract: string,
): Promise<EsgValidationResult | null> {
  const contractTenant = effectiveContractTenant(row)
  const missing = await checkParent(
    reader,
    row,
    buildContractPath(contractTenant, contract),
    'Contract',
    `${contractTenant}/${contract}`,
  )
  if (missing) return missing

  if (contractTenant === 'common' && row.tenant !== 'common') {
    const local = await moExists(reader, buildContractPath(row.tenant, contract))
    if (local.error)
      return errorResult(row.rowIndex, `Contract ambiguity check failed: ${local.error}`)
    if (local.exists) {
      return errorResult(
        row.rowIndex,
        `Contract ${contract} exists in both ${row.tenant} and common; remove contract_tenant or rename one contract to avoid ambiguous APIC binding`,
      )
    }
  }
  return null
}

// ─── ESG deploy ───────────────────────────────────────────────────────────────

export async function validateEsgDeployRows(
  rows: ParsedEsgRow[],
  apicHost: string,
  apicToken: string,
  reader: ApicReader = createApicReader(apicHost, apicToken),
): Promise<EsgValidationResult[]> {
  return runParallel<ParsedEsgRow, EsgValidationResult>(rows, 10, async (row) => {
    try {
      const parentError =
        (await checkParent(reader, row, buildTenantPath(row.tenant), 'Tenant', row.tenant)) ??
        (await checkParent(
          reader,
          row,
          buildAppProfilePath(row.tenant, row.anp),
          'ANP',
          `${row.tenant}/${row.anp}`,
        )) ??
        (await checkParent(
          reader,
          row,
          buildVrfPath(row.tenant, row.vrf),
          'VRF',
          `${row.tenant}/${row.vrf}`,
        ))
      if (parentError) return parentError

      const contracts = Array.from(new Set([...row.consContracts, ...row.provContracts]))
      for (const contract of contracts) {
        const contractError = await validateContract(reader, row, contract)
        if (contractError) return contractError
      }

      const state = await readEsg(reader, row)
      if ('error' in state) return errorResult(row.rowIndex, state.error)
      if (!state.exists) return { rowIndex: row.rowIndex, status: 'deploy' }

      const vrfError = validateEsgVrf(esgLabel(row), row.vrf, state.children)
      if (vrfError) return errorResult(row.rowIndex, vrfError)

      const contractTenant = effectiveContractTenant(row)
      const missingContracts = requestedContracts(row).filter(
        (c) => !hasContract(state.children, c, contractTenant),
      )
      const descriptionChanged = (state.attrs.descr ?? '') !== (row.esg_desc ?? '')
      const missingVrf = !esgVrf(state.children)
      const extras = extraContracts(state.children, row)
      const warning =
        extras.length > 0
          ? `APIC has contracts not listed in the CSV. They will be kept: ${formatContracts(extras)}`
          : undefined

      if (missingContracts.length === 0 && !descriptionChanged && !missingVrf) {
        return { rowIndex: row.rowIndex, status: 'exists', warning }
      }

      const changes = [
        descriptionChanged && 'description',
        missingVrf && 'VRF',
        missingContracts.length > 0 && `contracts (${formatContracts(missingContracts)})`,
      ].filter(Boolean)
      return {
        rowIndex: row.rowIndex,
        status: 'deploy',
        message: `ESG exists; ${changes.join(', ')} will be updated`,
        warning,
      }
    } catch (err) {
      return errorResult(row.rowIndex, networkMessage(err))
    }
  })
}

export async function deployEsgRows(
  rows: ParsedEsgRow[],
  apicHost: string,
  apicToken: string,
): Promise<EsgDeployResult[]> {
  return runParallel<ParsedEsgRow, EsgDeployResult>(rows, 5, async (row) => {
    try {
      const esgPath = buildEsgPath(row)
      const esgError = await postApic(apicHost, esgPath, esgPayload(row), apicToken, 'ESG deploy')
      if (esgError) return { rowIndex: row.rowIndex, success: false, message: esgError }

      const errors: string[] = []
      for (const { role, contract } of requestedContracts(row)) {
        const relationError = await postApic(
          apicHost,
          esgPath,
          contractAttachmentPayload(role, contract),
          apicToken,
          role === 'consumer'
            ? `Consumed contract ${contract} attachment`
            : `Provided contract ${contract} attachment`,
        )
        if (relationError) errors.push(relationError)
      }

      return errors.length > 0
        ? { rowIndex: row.rowIndex, success: false, message: errors.join('; ') }
        : { rowIndex: row.rowIndex, success: true }
    } catch (err) {
      return { rowIndex: row.rowIndex, success: false, message: networkMessage(err) }
    }
  })
}

// ─── ESG rollback ─────────────────────────────────────────────────────────────

export async function validateEsgRollbackRows(
  rows: ParsedEsgRow[],
  apicHost: string,
  apicToken: string,
  reader: ApicReader = createApicReader(apicHost, apicToken),
): Promise<EsgValidationResult[]> {
  return runParallel<ParsedEsgRow, EsgValidationResult>(rows, 10, async (row) => {
    try {
      const state = await readEsg(reader, row)
      if ('error' in state) return errorResult(row.rowIndex, state.error)
      if (!state.exists) return { rowIndex: row.rowIndex, status: 'missing' }

      const vrfError = validateEsgVrf(esgLabel(row), row.vrf, state.children)
      if (vrfError) return errorResult(row.rowIndex, vrfError)

      const contractTenant = effectiveContractTenant(row)
      const missingContracts = requestedContracts(row).filter(
        (c) => !hasContract(state.children, c, contractTenant),
      )
      if (missingContracts.length > 0) {
        return errorResult(
          row.rowIndex,
          `ESG ${esgLabel(row)} is missing contracts listed in the CSV: ${formatContracts(missingContracts)}`,
        )
      }

      const selectors = selectorCount(state.children)
      if (selectors > 0) {
        return errorResult(
          row.rowIndex,
          `ESG ${esgLabel(row)} still has ${selectors} selector${selectors === 1 ? '' : 's'}; remove them with Rollback Selectors first`,
        )
      }

      return { rowIndex: row.rowIndex, status: 'rollback' }
    } catch (err) {
      return errorResult(row.rowIndex, networkMessage(err))
    }
  })
}

export async function rollbackEsgRows(
  rows: ParsedEsgRow[],
  apicHost: string,
  apicToken: string,
): Promise<EsgDeployResult[]> {
  return runParallel<ParsedEsgRow, EsgDeployResult>(rows, 5, async (row) => {
    try {
      const error = await postApic(
        apicHost,
        buildEsgPath(row),
        esgDeletePayload(row),
        apicToken,
        'ESG delete',
      )
      return error
        ? { rowIndex: row.rowIndex, success: false, message: error }
        : { rowIndex: row.rowIndex, success: true }
    } catch (err) {
      return { rowIndex: row.rowIndex, success: false, message: networkMessage(err) }
    }
  })
}

// ─── Selector deploy ──────────────────────────────────────────────────────────

type EpgChild = { fvRsBd?: { attributes: { tDn?: string; tnFvBDName?: string } } }
type BdChild = { fvRsCtx?: { attributes: { tDn?: string; tnFvCtxName?: string } } }

async function readEpgVrf(
  reader: ApicReader,
  row: ParsedEsgSelectorRow,
): Promise<{ vrf: VrfRef } | { error: string }> {
  const epgDn = buildSelectedEpgDn(row)
  const epg = await moExists(reader, buildEpgPathFromDn(epgDn))
  if (epg.error) return { error: `EPG check failed: ${epg.error}` }
  if (!epg.exists) return { error: `EPG not found: ${epgDn}` }

  const epgChildren = await readImdata<EpgChild>(
    reader,
    buildEpgChildrenPathFromDn(epgDn),
    'EPG children check',
  )
  if ('error' in epgChildren) return epgChildren
  const bd = epgChildren.items.find((item) => item.fvRsBd)?.fvRsBd?.attributes
  const bdName = bd?.tnFvBDName || bd?.tDn?.split('/BD-')[1]
  if (!bdName) return { error: `EPG ${epgDn} has no bridge domain, so its VRF is unknown` }
  const bdTenant = bd?.tDn?.match(/^uni\/tn-([^/]+)\//)?.[1] ?? row.tenant

  const bdChildren = await readImdata<BdChild>(
    reader,
    buildBridgeDomainChildrenPath(bdTenant, bdName),
    'Bridge domain children check',
  )
  if ('error' in bdChildren) return bdChildren
  const vrf = vrfFromRelation(bdChildren.items.find((item) => item.fvRsCtx)?.fvRsCtx?.attributes)
  if (!vrf) return { error: `Bridge domain ${bdTenant}/${bdName} has no VRF` }
  return { vrf: { name: vrf.name, tenant: vrf.tenant ?? bdTenant } }
}

async function findOtherEsgSelectingEpg(
  reader: ApicReader,
  row: ParsedEsgSelectorRow,
): Promise<{ esgDn?: string } | { error: string }> {
  const ownDn = buildEsgDn(row)
  const selectors = await readImdata<{ fvEPgSelector?: { attributes: { dn?: string } } }>(
    reader,
    buildEpgSelectorClassPath(buildSelectedEpgDn(row)),
    'EPG selector lookup',
  )
  if ('error' in selectors) return selectors
  const other = selectors.items
    .map((item) => parentEsgDn(item.fvEPgSelector?.attributes.dn))
    .find((dn) => dn && dn !== ownDn)
  return { esgDn: other }
}

async function findOtherEsgSelectingIp(
  reader: ApicReader,
  row: ParsedEsgSelectorRow,
  vrf: VrfRef,
): Promise<{ esgDn?: string } | { error: string }> {
  const ownDn = buildEsgDn(row)
  const selectors = await readImdata<{
    fvEPSelector?: { attributes: { dn?: string; matchExpression?: string } }
  }>(reader, buildIpSelectorClassPath(row.selector_value), 'IP selector lookup')
  if ('error' in selectors) return selectors

  const candidates = new Set<string>()
  for (const item of selectors.items) {
    const attrs = item.fvEPSelector?.attributes
    if (parseIpMatchExpression(attrs?.matchExpression) !== row.selector_value) continue
    const dn = parentEsgDn(attrs?.dn)
    if (dn && dn !== ownDn) candidates.add(dn)
  }

  for (const dn of candidates) {
    const children = await readImdata<EsgChild>(
      reader,
      buildEsgChildrenPathFromDn(dn),
      'ESG children check',
    )
    if ('error' in children) return children
    const otherVrf = esgVrf(children.items)
    const otherTenant = dn.match(/^uni\/tn-([^/]+)\//)?.[1]
    if (otherVrf && sameVrf(vrf, { name: otherVrf.name, tenant: otherVrf.tenant ?? otherTenant })) {
      return { esgDn: dn }
    }
  }
  return {}
}

export async function validateEsgSelectorDeployRows(
  rows: ParsedEsgSelectorRow[],
  apicHost: string,
  apicToken: string,
  reader: ApicReader = createApicReader(apicHost, apicToken),
): Promise<EsgValidationResult[]> {
  return runParallel<ParsedEsgSelectorRow, EsgValidationResult>(rows, 10, async (row) => {
    try {
      const state = await readEsg(reader, row)
      if ('error' in state) return errorResult(row.rowIndex, state.error)
      if (!state.exists) {
        return errorResult(
          row.rowIndex,
          `ESG not found: ${esgLabel(row)}. Deploy the ESG before adding selectors`,
        )
      }

      const scope = esgVrf(state.children)
      if (!scope) return errorResult(row.rowIndex, `ESG ${esgLabel(row)} has no VRF`)
      const vrf: VrfRef = { name: scope.name, tenant: scope.tenant ?? row.tenant }

      if (hasSelector(state.children, row)) return { rowIndex: row.rowIndex, status: 'exists' }

      if (row.selector_type === 'epg') {
        const epgVrf = await readEpgVrf(reader, row)
        if ('error' in epgVrf) return errorResult(row.rowIndex, epgVrf.error)
        if (!sameVrf(vrf, epgVrf.vrf)) {
          return errorResult(
            row.rowIndex,
            `EPG ${row.selector_value} is in VRF ${epgVrf.vrf.tenant}/${epgVrf.vrf.name}, but ESG ${esgLabel(row)} is in VRF ${vrf.tenant}/${vrf.name}`,
          )
        }
        const other = await findOtherEsgSelectingEpg(reader, row)
        if ('error' in other) return errorResult(row.rowIndex, other.error)
        if (other.esgDn) {
          return errorResult(
            row.rowIndex,
            `EPG ${row.selector_value} is already selected by ${other.esgDn}; an EPG can belong to only one ESG`,
          )
        }
      } else {
        const other = await findOtherEsgSelectingIp(reader, row, vrf)
        if ('error' in other) return errorResult(row.rowIndex, other.error)
        if (other.esgDn) {
          return errorResult(
            row.rowIndex,
            `IP ${row.selector_value} is already selected by ${other.esgDn} in the same VRF`,
          )
        }
      }

      return { rowIndex: row.rowIndex, status: 'deploy' }
    } catch (err) {
      return errorResult(row.rowIndex, networkMessage(err))
    }
  })
}

export async function deployEsgSelectorRows(
  rows: ParsedEsgSelectorRow[],
  apicHost: string,
  apicToken: string,
): Promise<EsgDeployResult[]> {
  return runParallel<ParsedEsgSelectorRow, EsgDeployResult>(rows, 5, async (row) => {
    try {
      const error = await postApic(
        apicHost,
        buildEsgPath(row),
        selectorPayload(row),
        apicToken,
        'Selector deploy',
      )
      return error
        ? { rowIndex: row.rowIndex, success: false, message: error }
        : { rowIndex: row.rowIndex, success: true }
    } catch (err) {
      return { rowIndex: row.rowIndex, success: false, message: networkMessage(err) }
    }
  })
}

// ─── Selector rollback ────────────────────────────────────────────────────────

export async function validateEsgSelectorRollbackRows(
  rows: ParsedEsgSelectorRow[],
  apicHost: string,
  apicToken: string,
  reader: ApicReader = createApicReader(apicHost, apicToken),
): Promise<EsgValidationResult[]> {
  return runParallel<ParsedEsgSelectorRow, EsgValidationResult>(rows, 10, async (row) => {
    try {
      const state = await readEsg(reader, row)
      if ('error' in state) return errorResult(row.rowIndex, state.error)
      if (!state.exists) {
        return {
          rowIndex: row.rowIndex,
          status: 'missing',
          message: `ESG ${esgLabel(row)} not found`,
        }
      }
      if (!hasSelector(state.children, row)) {
        return {
          rowIndex: row.rowIndex,
          status: 'missing',
          message: `Selector not found on ESG ${esgLabel(row)}`,
        }
      }
      return { rowIndex: row.rowIndex, status: 'rollback' }
    } catch (err) {
      return errorResult(row.rowIndex, networkMessage(err))
    }
  })
}

export async function rollbackEsgSelectorRows(
  rows: ParsedEsgSelectorRow[],
  apicHost: string,
  apicToken: string,
): Promise<EsgDeployResult[]> {
  return runParallel<ParsedEsgSelectorRow, EsgDeployResult>(rows, 5, async (row) => {
    try {
      const error = await postApic(
        apicHost,
        buildEsgPath(row),
        selectorDeletePayload(row),
        apicToken,
        'Selector delete',
      )
      return error
        ? { rowIndex: row.rowIndex, success: false, message: error }
        : { rowIndex: row.rowIndex, success: true }
    } catch (err) {
      return { rowIndex: row.rowIndex, success: false, message: networkMessage(err) }
    }
  })
}
