import type { ParsedSelectorRow, IpgType, CsvValidationError } from './types'

const REQUIRED_HEADERS = ['interface_profile', 'selector_name', 'port', 'ipg_name', 'ipg_type'] as const
const IPG_TYPES: IpgType[] = ['port', 'pc', 'vpc']
const PORT_RE = /^(\d+)\/(\d+)$/
const SAFE_NAME_RE = /^[A-Za-z0-9_\-]+$/

export const SELECTOR_REQUIRED_COLUMNS_HELP =
  'Required columns: interface_profile, selector_name, port, ipg_name, ipg_type'

export function validateSelectorCsv(
  rawRows: Record<string, string>[],
  headers: string[]
): { rows: ParsedSelectorRow[]; errors: CsvValidationError[] } {
  const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h))
  if (missingHeaders.length > 0) {
    return {
      rows: [],
      errors: [{
        rowIndex: 0,
        field: 'headers',
        message: `Missing required columns: ${missingHeaders.join(', ')}`,
      }],
    }
  }

  const rows: ParsedSelectorRow[] = []
  const errors: CsvValidationError[] = []

  rawRows.forEach((raw, idx) => {
    const rowIndex = idx + 1
    const rowErrors: CsvValidationError[] = []
    const addError = (field: string, message: string) =>
      rowErrors.push({ rowIndex, field, message })

    for (const field of ['interface_profile', 'selector_name', 'ipg_name'] as const) {
      if (!raw[field]?.trim()) addError(field, `${field} is required`)
    }

    const selectorName = raw.selector_name?.trim() ?? ''
    if (selectorName && !SAFE_NAME_RE.test(selectorName)) {
      addError('selector_name', `selector_name must contain only letters, numbers, hyphens, and underscores — got "${selectorName}" (slashes are not allowed)`)
    }

    const portRaw = raw.port?.trim() ?? ''
    const portMatch = portRaw.match(PORT_RE)
    let card = 0
    let port_num = 0
    if (!portMatch) {
      addError('port', `port must be in card/port form (e.g. "1/1"), got "${raw.port}"`)
    } else {
      card = parseInt(portMatch[1], 10)
      port_num = parseInt(portMatch[2], 10)
      if (card < 1) addError('port', `card must be ≥ 1`)
      if (port_num < 1) addError('port', `port must be ≥ 1`)
    }

    const ipg_type = raw.ipg_type?.trim() as IpgType
    if (!IPG_TYPES.includes(ipg_type)) {
      addError('ipg_type', `ipg_type must be port, pc, or vpc — got "${raw.ipg_type}"`)
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors)
    } else {
      rows.push({
        rowIndex,
        interface_profile: raw.interface_profile.trim(),
        selector_name: raw.selector_name.trim(),
        port: portRaw,
        ipg_name: raw.ipg_name.trim(),
        ipg_type,
        card,
        port_num,
        description: raw.description?.trim() || undefined,
      })
    }
  })

  // Duplicate detection — two rows targeting the same selector on the same profile
  // would conflict at APIC; catch here before sending anything.
  const seenSelector = new Map<string, number>()
  const seenPort = new Map<string, number>()
  for (const row of rows) {
    const selKey = `${row.interface_profile}|${row.selector_name}`
    const firstSel = seenSelector.get(selKey)
    if (firstSel !== undefined) {
      errors.push({ rowIndex: row.rowIndex, field: 'duplicate', message: `Duplicate selector ${row.selector_name} on profile ${row.interface_profile} (first at row ${firstSel})` })
    } else {
      seenSelector.set(selKey, row.rowIndex)
    }

    const portKey = `${row.interface_profile}|${row.card}/${row.port_num}`
    const firstPort = seenPort.get(portKey)
    if (firstPort !== undefined) {
      errors.push({ rowIndex: row.rowIndex, field: 'duplicate', message: `Port ${row.port} already targeted by row ${firstPort} on profile ${row.interface_profile}` })
    } else {
      seenPort.set(portKey, row.rowIndex)
    }
  }
  const duplicateIndexes = new Set(errors.filter(e => e.field === 'duplicate').map(e => e.rowIndex))
  const dedupedRows = rows.filter(r => !duplicateIndexes.has(r.rowIndex))

  return { rows: dedupedRows, errors }
}
