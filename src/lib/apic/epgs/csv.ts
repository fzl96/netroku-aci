import type { CsvValidationError, ParsedEpgContractRow, ParsedEpgRow } from './types'

const EPG_REQUIRED_HEADERS = ['tenant', 'epg', 'bd'] as const
const CONTRACT_REQUIRED_HEADERS = ['tenant', 'epg', 'bd', 'contract'] as const
const SAFE_DN_SEGMENT_RE = /^[^\s/[\]](?:[^/[\]]*[^\s/[\]])?$/

export const EPG_ONLY_REQUIRED_COLUMNS_HELP =
  'Required columns: tenant, anp, epg, bd. Optional: epg_desc. The anp column may also be named ap.'

export const EPG_REQUIRED_COLUMNS_HELP =
  'Required columns: tenant, anp, epg, bd, contract. Optional: epg_desc. The anp column may also be named ap.'

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

export function validateEpgContractCsv(
  rawRows: Record<string, string>[],
  headers: string[],
): { rows: ParsedEpgContractRow[]; errors: CsvValidationError[] } {
  const missingHeaders = CONTRACT_REQUIRED_HEADERS.filter(h => !headers.includes(h))
  return validateEpgRows(rawRows, headers, missingHeaders, true) as {
    rows: ParsedEpgContractRow[]
    errors: CsvValidationError[]
  }
}

export function validateEpgCsv(
  rawRows: Record<string, string>[],
  headers: string[],
): { rows: ParsedEpgRow[]; errors: CsvValidationError[] } {
  const missingHeaders = EPG_REQUIRED_HEADERS.filter(h => !headers.includes(h))
  return validateEpgRows(rawRows, headers, missingHeaders, false) as {
    rows: ParsedEpgRow[]
    errors: CsvValidationError[]
  }
}

function validateEpgRows(
  rawRows: Record<string, string>[],
  headers: string[],
  missingHeaders: string[],
  requireContract: boolean,
): { rows: (ParsedEpgRow | ParsedEpgContractRow)[]; errors: CsvValidationError[] } {
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

  const rows: (ParsedEpgRow | ParsedEpgContractRow)[] = []
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
    if (requireContract) {
      validateSegment(rowErrors, rowIndex, 'contract', contract)
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors)
      return
    }

    rows.push(requireContract
      ? { rowIndex, tenant, anp, epg, bd, contract, epg_desc }
      : { rowIndex, tenant, anp, epg, bd, epg_desc }
    )
  })

  const seen = new Map<string, number>()
  for (const row of rows) {
    const key = requireContract
      ? `${row.tenant}|${row.anp}|${row.epg}|${row.bd}|${'contract' in row ? row.contract : ''}`
      : `${row.tenant}|${row.anp}|${row.epg}|${row.bd}`
    const firstIndex = seen.get(key)
    if (firstIndex !== undefined) {
      errors.push({
        rowIndex: row.rowIndex,
        field: 'duplicate',
        message: `Duplicate EPG${requireContract ? ' contract' : ''} row (first at row ${firstIndex})`,
      })
    } else {
      seen.set(key, row.rowIndex)
    }
  }

  const duplicateIndexes = new Set(errors.filter(e => e.field === 'duplicate').map(e => e.rowIndex))
  return { rows: rows.filter(r => !duplicateIndexes.has(r.rowIndex)), errors }
}
