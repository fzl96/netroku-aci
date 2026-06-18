import type {
  CsvValidationError,
  ParsedBridgeDomainL2Row,
  ParsedBridgeDomainL3Row,
} from './types'
import { checkHeaders, deduplicateRows } from '@/lib/apic/csv-utils'

const L2_REQUIRED_HEADERS = ['tenant', 'bd', 'vrf'] as const
const L3_REQUIRED_HEADERS = ['tenant', 'bd', 'vrf', 'subnet', 'l3out'] as const
const SAFE_DN_SEGMENT_RE = /^[^\s/[\]](?:[^/[\]]*[^\s/[\]])?$/

export const BD_L2_REQUIRED_COLUMNS_HELP =
  'Required columns: tenant, bd, vrf. Optional: bd_desc'

export const BD_L3_REQUIRED_COLUMNS_HELP =
  'Required columns: tenant, bd, vrf, subnet, l3out. Optional: bd_desc'

function isValidIpv4Cidr(value: string): boolean {
  const [ip, prefix, extra] = value.split('/')
  if (!ip || !prefix || extra !== undefined) return false
  const prefixNum = Number(prefix)
  if (!Number.isInteger(prefixNum) || prefixNum < 0 || prefixNum > 32) return false

  const octets = ip.split('.')
  if (octets.length !== 4) return false
  return octets.every((part) => {
    if (!/^\d+$/.test(part)) return false
    const n = Number(part)
    return n >= 0 && n <= 255
  })
}

function validateCommonFields(
  raw: Record<string, string>,
  rowIndex: number,
): { tenant: string; bd: string; vrf: string; bd_desc?: string; errors: CsvValidationError[] } {
  const errors: CsvValidationError[] = []
  const addError = (field: string, message: string) =>
    errors.push({ rowIndex, field, message })

  const tenant = raw.tenant?.trim() ?? ''
  const bd = raw.bd?.trim() ?? ''
  const vrf = raw.vrf?.trim() ?? ''
  const bd_desc = raw.bd_desc?.trim() || undefined

  for (const [field, value] of [['tenant', tenant], ['bd', bd], ['vrf', vrf]] as const) {
    if (!value) {
      addError(field, `${field} is required`)
    } else if (!SAFE_DN_SEGMENT_RE.test(value)) {
      addError(field, `${field} must not contain slashes or square brackets`)
    }
  }

  return { tenant, bd, vrf, bd_desc, errors }
}

export function validateBridgeDomainL2Csv(
  rawRows: Record<string, string>[],
  headers: string[],
): { rows: ParsedBridgeDomainL2Row[]; errors: CsvValidationError[] } {
  const headerError = checkHeaders(L2_REQUIRED_HEADERS, headers)
  if (headerError) return { rows: [], errors: [headerError] }

  const rows: ParsedBridgeDomainL2Row[] = []
  const errors: CsvValidationError[] = []

  rawRows.forEach((raw, idx) => {
    const rowIndex = idx + 1
    const common = validateCommonFields(raw, rowIndex)
    if (common.errors.length > 0) {
      errors.push(...common.errors)
      return
    }

    rows.push({
      rowIndex,
      tenant: common.tenant,
      bd: common.bd,
      vrf: common.vrf,
      bd_desc: common.bd_desc,
    })
  })

  return {
    rows: deduplicateRows(rows, errors, [{
      key: r => `${r.tenant}|${r.bd}`,
      message: (r, first) => `Duplicate bridge domain ${r.tenant}/${r.bd} (first at row ${first})`,
    }]),
    errors,
  }
}

export function validateBridgeDomainL3Csv(
  rawRows: Record<string, string>[],
  headers: string[],
): { rows: ParsedBridgeDomainL3Row[]; errors: CsvValidationError[] } {
  const headerError = checkHeaders(L3_REQUIRED_HEADERS, headers)
  if (headerError) return { rows: [], errors: [headerError] }

  const rows: ParsedBridgeDomainL3Row[] = []
  const errors: CsvValidationError[] = []

  rawRows.forEach((raw, idx) => {
    const rowIndex = idx + 1
    const common = validateCommonFields(raw, rowIndex)
    const rowErrors = [...common.errors]
    const addError = (field: string, message: string) =>
      rowErrors.push({ rowIndex, field, message })

    const subnet = raw.subnet?.trim() ?? ''
    const l3out = raw.l3out?.trim() ?? ''

    if (!subnet) {
      addError('subnet', 'subnet is required')
    } else if (!isValidIpv4Cidr(subnet)) {
      addError('subnet', `subnet must be IPv4 CIDR form, got "${raw.subnet}"`)
    }

    if (!l3out) {
      addError('l3out', 'l3out is required')
    } else if (!SAFE_DN_SEGMENT_RE.test(l3out)) {
      addError('l3out', 'l3out must not contain slashes or square brackets')
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors)
      return
    }

    rows.push({
      rowIndex,
      tenant: common.tenant,
      bd: common.bd,
      vrf: common.vrf,
      bd_desc: common.bd_desc,
      subnet,
      l3out,
    })
  })

  return {
    rows: deduplicateRows(rows, errors, [{
      key: r => `${r.tenant}|${r.bd}|${r.subnet}|${r.l3out}`,
      message: (_, first) => `Duplicate bridge domain L3 row (first at row ${first})`,
    }]),
    errors,
  }
}
