import { deduplicateRows } from '@/lib/apic/csv-utils'
import type { CsvValidationError, ParsedEpgContractRow, ParsedEpgRow } from './types'

const EPG_REQUIRED_HEADERS = ['tenant', 'epg', 'bd'] as const
const CONTRACT_REQUIRED_HEADERS = ['tenant', 'epg', 'bd', 'contract'] as const
const SAFE_DN_SEGMENT_RE = /^[^\s/[\]](?:[^/[\]]*[^\s/[\]])?$/

export const EPG_REQUIRED_COLUMNS_HELP =
  'Required columns: tenant, anp, epg, bd. Optional: cons_contract, prov_contract, epg_desc. The anp column may also be named ap. Multiple contracts may be comma-separated.'

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

    rows.push({ rowIndex, tenant, anp, epg, bd, consContracts, provContracts, epg_desc })
  })

  return {
    rows: deduplicateRows(rows, errors, [{
      key: row => `${row.tenant}|${row.anp}|${row.epg}|${row.bd}|${contractKey(row.consContracts)}|${contractKey(row.provContracts)}`,
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

    rows.push({ rowIndex, tenant, anp, epg, bd, contract, epg_desc })
  })

  return {
    rows: deduplicateRows(rows, errors, [{
      key: row => `${row.tenant}|${row.anp}|${row.epg}|${row.bd}|${row.contract}`,
      message: (_, first) => `Duplicate EPG contract row (first at row ${first})`,
    }]),
    errors,
  }
}
