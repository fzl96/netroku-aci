import { deduplicateRows } from '@/lib/apic/csv-utils'
import {
  effectiveBridgeDomainTenant,
  effectiveContractTenant,
  type CsvValidationError,
  type ParsedEpgContractRow,
  type ParsedEpgRow,
} from './types'

const EPG_REQUIRED_HEADERS = ['tenant', 'epg', 'bd'] as const
const CONTRACT_REQUIRED_HEADERS = ['tenant', 'epg', 'bd', 'contract'] as const
const SAFE_DN_SEGMENT_RE = /^[^\s/[\]](?:[^/[\]]*[^\s/[\]])?$/

export const EPG_REQUIRED_COLUMNS_HELP =
  'Required columns: tenant, anp, epg, bd. Optional: bd_tenant, contract_tenant, phys_domain, cons_contract, prov_contract, epg_desc. Empty bd_tenant and contract_tenant use tenant; common supports shared lookup. The anp column may also be named ap. Multiple contracts may be comma-separated.'

export const EPG_ONLY_REQUIRED_COLUMNS_HELP = EPG_REQUIRED_COLUMNS_HELP

function validateSegment(
  errors: CsvValidationError[],
  rowIndex: number,
  field: string,
  value: string,
) {
  if (!value) {
    errors.push({ rowIndex, field, message: `${field} is required` })
  } else if (!SAFE_DN_SEGMENT_RE.test(value)) {
    errors.push({ rowIndex, field, message: `${field} must not contain slashes or square brackets` })
  }
}

function parseContractList(
  raw: string | undefined,
  field: string,
  rowIndex: number,
  errors: CsvValidationError[],
): string[] {
  const values = (raw ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  const seen = new Set<string>()
  const contracts: string[] = []
  for (const contract of values) {
    validateSegment(errors, rowIndex, field, contract)
    if (seen.has(contract)) {
      errors.push({ rowIndex, field, message: `duplicate contract ${contract}` })
    } else {
      seen.add(contract)
      contracts.push(contract)
    }
  }
  return contracts
}

function contractKey(values: string[]): string {
  return [...values].sort().join(',')
}

function parseBridgeDomainTenant(
  raw: string | undefined,
  tenant: string,
  rowIndex: number,
  errors: CsvValidationError[],
): string {
  const bdTenant = raw?.trim() ?? ''
  if (!bdTenant) return tenant

  validateSegment(errors, rowIndex, 'bd_tenant', bdTenant)

  if (bdTenant === tenant) return tenant
  if (bdTenant.toLowerCase() === 'common') return 'common'

  errors.push({
    rowIndex,
    field: 'bd_tenant',
    message: 'bd_tenant must be empty, match tenant, or be common',
  })
  return bdTenant
}

function parseContractTenant(
  raw: string | undefined,
  tenant: string,
  rowIndex: number,
  errors: CsvValidationError[],
): string {
  const contractTenant = raw?.trim() ?? ''
  if (!contractTenant) return tenant

  validateSegment(errors, rowIndex, 'contract_tenant', contractTenant)

  if (contractTenant === tenant) return tenant
  if (contractTenant.toLowerCase() === 'common') return 'common'

  errors.push({
    rowIndex,
    field: 'contract_tenant',
    message: 'contract_tenant must be empty, match tenant, or be common',
  })
  return contractTenant
}

function parsePhysicalDomain(
  raw: string | undefined,
  rowIndex: number,
  errors: CsvValidationError[],
): string | undefined {
  const physDomain = raw?.trim() ?? ''
  if (!physDomain) return undefined

  validateSegment(errors, rowIndex, 'phys_domain', physDomain)
  return physDomain
}

export function validateEpgCsv(
  rawRows: Record<string, string>[],
  headers: string[],
): { rows: ParsedEpgRow[]; errors: CsvValidationError[] } {
  const missingHeaders = EPG_REQUIRED_HEADERS.filter(h => !headers.includes(h))
  const hasAnpHeader = headers.includes('anp') || headers.includes('ap')
  if (missingHeaders.length > 0 || !hasAnpHeader) {
    return {
      rows: [],
      errors: [{
        rowIndex: 0,
        field: 'headers',
        message: `Missing required columns: ${[
          ...missingHeaders,
          !hasAnpHeader ? 'anp (or ap)' : '',
        ].filter(Boolean).join(', ')}`,
      }],
    }
  }

  const rows: ParsedEpgRow[] = []
  const errors: CsvValidationError[] = []

  rawRows.forEach((raw, idx) => {
    const rowIndex = idx + 1
    const rowErrors: CsvValidationError[] = []

    const tenant = raw.tenant?.trim() ?? ''
    const anp = raw.anp?.trim() || raw.ap?.trim() || ''
    const epg = raw.epg?.trim() ?? ''
    const bd = raw.bd?.trim() ?? ''
    const bd_tenant = parseBridgeDomainTenant(raw.bd_tenant, tenant, rowIndex, rowErrors)
    const contract_tenant = parseContractTenant(raw.contract_tenant, tenant, rowIndex, rowErrors)
    const phys_domain = parsePhysicalDomain(raw.phys_domain ?? raw.physdom, rowIndex, rowErrors)
    const epg_desc = raw.epg_desc?.trim() || undefined
    const consContracts = parseContractList(raw.cons_contract, 'cons_contract', rowIndex, rowErrors)
    const provContracts = parseContractList(raw.prov_contract, 'prov_contract', rowIndex, rowErrors)

    validateSegment(rowErrors, rowIndex, 'tenant', tenant)
    validateSegment(rowErrors, rowIndex, 'anp', anp)
    validateSegment(rowErrors, rowIndex, 'epg', epg)
    validateSegment(rowErrors, rowIndex, 'bd', bd)

    if (rowErrors.length > 0) {
      errors.push(...rowErrors)
      return
    }

    rows.push({ rowIndex, tenant, anp, epg, bd, bd_tenant, contract_tenant, phys_domain, consContracts, provContracts, epg_desc })
  })

  return {
    rows: deduplicateRows(rows, errors, [{
      key: row => `${row.tenant}|${row.anp}|${row.epg}|${effectiveBridgeDomainTenant(row)}|${row.bd}|${effectiveContractTenant(row)}|${row.phys_domain ?? ''}|${contractKey(row.consContracts)}|${contractKey(row.provContracts)}`,
      message: (_, first) => `Duplicate EPG row (first at row ${first})`,
    }]),
    errors,
  }
}

export function validateEpgContractCsv(
  rawRows: Record<string, string>[],
  headers: string[],
): { rows: ParsedEpgContractRow[]; errors: CsvValidationError[] } {
  const missingHeaders = CONTRACT_REQUIRED_HEADERS.filter(h => !headers.includes(h))
  const hasAnpHeader = headers.includes('anp') || headers.includes('ap')
  if (missingHeaders.length > 0 || !hasAnpHeader) {
    return {
      rows: [],
      errors: [{
        rowIndex: 0,
        field: 'headers',
        message: `Missing required columns: ${[
          ...missingHeaders,
          !hasAnpHeader ? 'anp (or ap)' : '',
        ].filter(Boolean).join(', ')}`,
      }],
    }
  }

  const rows: ParsedEpgContractRow[] = []
  const errors: CsvValidationError[] = []

  rawRows.forEach((raw, idx) => {
    const rowIndex = idx + 1
    const rowErrors: CsvValidationError[] = []

    const tenant = raw.tenant?.trim() ?? ''
    const anp = raw.anp?.trim() || raw.ap?.trim() || ''
    const epg = raw.epg?.trim() ?? ''
    const bd = raw.bd?.trim() ?? ''
    const bd_tenant = parseBridgeDomainTenant(raw.bd_tenant, tenant, rowIndex, rowErrors)
    const contract_tenant = parseContractTenant(raw.contract_tenant, tenant, rowIndex, rowErrors)
    const phys_domain = parsePhysicalDomain(raw.phys_domain ?? raw.physdom, rowIndex, rowErrors)
    const contract = raw.contract?.trim() ?? ''
    const epg_desc = raw.epg_desc?.trim() || undefined

    validateSegment(rowErrors, rowIndex, 'tenant', tenant)
    validateSegment(rowErrors, rowIndex, 'anp', anp)
    validateSegment(rowErrors, rowIndex, 'epg', epg)
    validateSegment(rowErrors, rowIndex, 'bd', bd)
    validateSegment(rowErrors, rowIndex, 'contract', contract)

    if (rowErrors.length > 0) {
      errors.push(...rowErrors)
      return
    }

    rows.push({ rowIndex, tenant, anp, epg, bd, bd_tenant, contract_tenant, phys_domain, contract, epg_desc })
  })

  return {
    rows: deduplicateRows(rows, errors, [{
      key: row => `${row.tenant}|${row.anp}|${row.epg}|${effectiveBridgeDomainTenant(row)}|${row.bd}|${effectiveContractTenant(row)}|${row.phys_domain ?? ''}|${row.contract}`,
      message: (_, first) => `Duplicate EPG contract row (first at row ${first})`,
    }]),
    errors,
  }
}
