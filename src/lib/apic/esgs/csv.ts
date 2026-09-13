import { deduplicateRows } from '@/lib/apic/csv-utils'
import {
  effectiveContractTenant,
  effectiveEpgAnp,
  type CsvValidationError,
  type EsgSelectorType,
  type ParsedEsgRow,
  type ParsedEsgSelectorRow,
} from './types'

const ESG_REQUIRED_HEADERS = ['tenant', 'esg', 'vrf'] as const
const SELECTOR_REQUIRED_HEADERS = ['tenant', 'esg', 'selector_type', 'selector_value'] as const
const SAFE_DN_SEGMENT_RE = /^[^\s/[\]](?:[^/[\]]*[^\s/[\]])?$/
const SELECTOR_TYPES: readonly EsgSelectorType[] = ['epg', 'ip']

export const ESG_REQUIRED_COLUMNS_HELP =
  'Required columns: tenant, anp, esg, vrf. Optional: esg_desc, contract_tenant, cons_contract, prov_contract. The anp column may also be named ap. Empty contract_tenant uses tenant; common supports shared lookup. Multiple contracts may be comma-separated. Use one row per ESG.'

export const ESG_SELECTOR_REQUIRED_COLUMNS_HELP =
  'Required columns: tenant, anp, esg, selector_type, selector_value. Optional: epg_anp, selector_desc. The anp column may also be named ap. selector_type is epg or ip. For epg, selector_value is an EPG name in the same tenant, and epg_anp defaults to anp. For ip, selector_value is an IPv4 address or CIDR.'

function validateSegment(
  errors: CsvValidationError[],
  rowIndex: number,
  field: string,
  value: string,
) {
  if (!value) {
    errors.push({ rowIndex, field, message: `${field} is required` })
  } else if (!SAFE_DN_SEGMENT_RE.test(value)) {
    errors.push({
      rowIndex,
      field,
      message: `${field} must not contain slashes or square brackets`,
    })
  }
}

function missingHeadersError(
  required: readonly string[],
  headers: string[],
): CsvValidationError | null {
  const missing: string[] = required.filter((h) => !headers.includes(h))
  if (!headers.includes('anp') && !headers.includes('ap')) missing.push('anp (or ap)')
  if (missing.length === 0) return null
  return {
    rowIndex: 0,
    field: 'headers',
    message: `Missing required columns: ${missing.join(', ')}`,
  }
}

export function isValidIpv4OrCidr(value: string): boolean {
  const parts = value.split('/')
  if (parts.length > 2) return false
  const [ip, prefix] = parts
  if (prefix !== undefined) {
    if (!/^\d{1,2}$/.test(prefix) || Number(prefix) > 32) return false
  }
  const octets = ip.split('.')
  if (octets.length !== 4) return false
  return octets.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

function parseContractList(
  raw: string | undefined,
  field: string,
  rowIndex: number,
  errors: CsvValidationError[],
): string[] {
  const values = (raw ?? '')
    .split(',')
    .map((value) => value.trim())
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

export function validateEsgCsv(
  rawRows: Record<string, string>[],
  headers: string[],
): { rows: ParsedEsgRow[]; errors: CsvValidationError[] } {
  const headerError = missingHeadersError(ESG_REQUIRED_HEADERS, headers)
  if (headerError) return { rows: [], errors: [headerError] }

  const rows: ParsedEsgRow[] = []
  const errors: CsvValidationError[] = []

  rawRows.forEach((raw, idx) => {
    const rowIndex = idx + 1
    const rowErrors: CsvValidationError[] = []

    const tenant = raw.tenant?.trim() ?? ''
    const anp = raw.anp?.trim() || raw.ap?.trim() || ''
    const esg = raw.esg?.trim() ?? ''
    const vrf = raw.vrf?.trim() ?? ''
    const esg_desc = raw.esg_desc?.trim() || undefined

    validateSegment(rowErrors, rowIndex, 'tenant', tenant)
    validateSegment(rowErrors, rowIndex, 'anp', anp)
    validateSegment(rowErrors, rowIndex, 'esg', esg)
    validateSegment(rowErrors, rowIndex, 'vrf', vrf)
    const contract_tenant = parseContractTenant(raw.contract_tenant, tenant, rowIndex, rowErrors)
    const consContracts = parseContractList(raw.cons_contract, 'cons_contract', rowIndex, rowErrors)
    const provContracts = parseContractList(raw.prov_contract, 'prov_contract', rowIndex, rowErrors)

    if (rowErrors.length > 0) {
      errors.push(...rowErrors)
      return
    }

    rows.push({
      rowIndex,
      tenant,
      anp,
      esg,
      vrf,
      contract_tenant,
      consContracts,
      provContracts,
      esg_desc,
    })
  })

  return {
    rows: deduplicateRows(rows, errors, [
      {
        key: (row) => `${row.tenant}|${row.anp}|${row.esg}`,
        message: (row, first) =>
          `Duplicate ESG ${row.tenant}/${row.anp}/${row.esg} (first at row ${first}); list all contracts for an ESG in one row`,
      },
    ]),
    errors,
  }
}

export function validateEsgSelectorCsv(
  rawRows: Record<string, string>[],
  headers: string[],
): { rows: ParsedEsgSelectorRow[]; errors: CsvValidationError[] } {
  const headerError = missingHeadersError(SELECTOR_REQUIRED_HEADERS, headers)
  if (headerError) return { rows: [], errors: [headerError] }

  const rows: ParsedEsgSelectorRow[] = []
  const errors: CsvValidationError[] = []

  rawRows.forEach((raw, idx) => {
    const rowIndex = idx + 1
    const rowErrors: CsvValidationError[] = []
    const addError = (field: string, message: string) =>
      rowErrors.push({ rowIndex, field, message })

    const tenant = raw.tenant?.trim() ?? ''
    const anp = raw.anp?.trim() || raw.ap?.trim() || ''
    const esg = raw.esg?.trim() ?? ''
    const rawType = raw.selector_type?.trim().toLowerCase() ?? ''
    const selector_value = raw.selector_value?.trim() ?? ''
    const epg_anp = raw.epg_anp?.trim() || undefined
    const selector_desc = raw.selector_desc?.trim() || undefined

    validateSegment(rowErrors, rowIndex, 'tenant', tenant)
    validateSegment(rowErrors, rowIndex, 'anp', anp)
    validateSegment(rowErrors, rowIndex, 'esg', esg)

    let selector_type: EsgSelectorType | undefined
    if (!rawType) {
      addError('selector_type', 'selector_type is required')
    } else if (!SELECTOR_TYPES.includes(rawType as EsgSelectorType)) {
      addError('selector_type', `selector_type must be epg or ip, got "${raw.selector_type}"`)
    } else {
      selector_type = rawType as EsgSelectorType
    }

    if (selector_type === 'epg') {
      validateSegment(rowErrors, rowIndex, 'selector_value', selector_value)
      if (epg_anp) validateSegment(rowErrors, rowIndex, 'epg_anp', epg_anp)
    } else if (selector_type === 'ip') {
      if (!selector_value) {
        addError('selector_value', 'selector_value is required')
      } else if (!isValidIpv4OrCidr(selector_value)) {
        addError(
          'selector_value',
          `selector_value must be an IPv4 address or CIDR for ip selectors, got "${raw.selector_value}"`,
        )
      }
      if (epg_anp) addError('epg_anp', 'epg_anp only applies to epg selectors')
    }

    if (rowErrors.length > 0 || !selector_type) {
      errors.push(...rowErrors)
      return
    }

    rows.push({
      rowIndex,
      tenant,
      anp,
      esg,
      selector_type,
      selector_value,
      epg_anp,
      selector_desc,
    })
  })

  const uniqueRows = deduplicateRows(rows, errors, [
    {
      key: (row) =>
        row.selector_type === 'epg'
          ? `${row.tenant}|${row.anp}|${row.esg}|epg|${effectiveEpgAnp(row)}|${row.selector_value}`
          : `${row.tenant}|${row.anp}|${row.esg}|ip|${row.selector_value}`,
      message: (_, first) => `Duplicate selector row (first at row ${first})`,
    },
  ])

  return {
    rows: deduplicateRows(uniqueRows, errors, [
      {
        key: (row) =>
          row.selector_type === 'epg'
            ? `${row.tenant}|${effectiveEpgAnp(row)}|${row.selector_value}`
            : `ip-row-${row.rowIndex}`,
        message: (row, first) =>
          `EPG ${row.tenant}/${effectiveEpgAnp(row)}/${row.selector_value} is selected by more than one ESG in this CSV (first at row ${first}); an EPG can belong to only one ESG`,
      },
    ]),
    errors,
  }
}

export { effectiveContractTenant }
