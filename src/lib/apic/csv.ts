import type { ParsedRow, CsvValidationError, PortType, Mode, Immediacy } from './types'

const REQUIRED_HEADERS = ['tenant','ap','epg','vlan','node1','node2','port_type','interface_or_ipg','mode','immediacy'] as const
const PORT_TYPES: PortType[] = ['vpc', 'pc', 'port']
const MODES: Mode[] = ['regular', 'native', 'untagged']
const IMMEDIACIES: Immediacy[] = ['immediate', 'lazy']

export function validateCsvRows(
  rawRows: Record<string, string>[],
  headers: string[]
): { rows: ParsedRow[]; errors: CsvValidationError[] } {
  // Check headers first
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

  const rows: ParsedRow[] = []
  const errors: CsvValidationError[] = []

  rawRows.forEach((raw, idx) => {
    const rowIndex = idx + 1
    const rowErrors: CsvValidationError[] = []

    const addError = (field: string, message: string) =>
      rowErrors.push({ rowIndex, field, message })

    // Required string fields
    for (const field of ['tenant', 'ap', 'epg', 'interface_or_ipg'] as const) {
      if (!raw[field]?.trim()) addError(field, `${field} is required`)
    }

    // vlan
    const vlan = parseInt(raw.vlan, 10)
    if (isNaN(vlan) || vlan < 1 || vlan > 4094) {
      addError('vlan', `vlan must be 1–4094, got "${raw.vlan}"`)
    }

    // node1
    const node1 = parseInt(raw.node1, 10)
    if (isNaN(node1)) addError('node1', `node1 must be a number, got "${raw.node1}"`)

    // port_type
    const port_type = raw.port_type?.trim() as PortType
    const isValidPortType = PORT_TYPES.includes(port_type)
    if (!isValidPortType) {
      addError('port_type', `port_type must be vpc, pc, or port — got "${raw.port_type}"`)
    }

    // node2 vs port_type (only validate if port_type is valid)
    const node2Raw = raw.node2?.trim()
    let node2: number | null = null
    if (isValidPortType) {
      if (port_type === 'vpc') {
        if (!node2Raw) {
          addError('node2', 'node2 is required when port_type is vpc')
        } else {
          node2 = parseInt(node2Raw, 10)
          if (isNaN(node2)) addError('node2', `node2 must be a number, got "${raw.node2}"`)
        }
      } else if (node2Raw) {
        addError('node2', `node2 must be blank when port_type is ${port_type}`)
      }
    }

    // mode
    const mode = raw.mode?.trim() as Mode
    if (!MODES.includes(mode)) {
      addError('mode', `mode must be regular, native, or untagged — got "${raw.mode}"`)
    }

    // immediacy
    const immediacy = raw.immediacy?.trim() as Immediacy
    if (!IMMEDIACIES.includes(immediacy)) {
      addError('immediacy', `immediacy must be immediate or lazy — got "${raw.immediacy}"`)
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors)
    } else {
      rows.push({
        rowIndex,
        tenant: raw.tenant.trim(),
        ap: raw.ap.trim(),
        epg: raw.epg.trim(),
        vlan,
        node1,
        node2,
        port_type,
        interface_or_ipg: raw.interface_or_ipg.trim(),
        mode,
        immediacy,
      })
    }
  })

  // Duplicate row detection (same tenant/ap/epg/vlan/node1/node2/port/interface)
  const seen = new Map<string, number>()
  for (const row of rows) {
    const key = `${row.tenant}|${row.ap}|${row.epg}|${row.vlan}|${row.node1}|${row.node2 ?? ''}|${row.port_type}|${row.interface_or_ipg}`
    const firstIndex = seen.get(key)
    if (firstIndex !== undefined) {
      errors.push({ rowIndex: row.rowIndex, field: 'duplicate', message: `Duplicate of row ${firstIndex}` })
    } else {
      seen.set(key, row.rowIndex)
    }
  }
  // Remove duplicate rows so they don't reach validate/deploy
  const duplicateIndexes = new Set(errors.filter(e => e.field === 'duplicate').map(e => e.rowIndex))
  const dedupedRows = rows.filter(r => !duplicateIndexes.has(r.rowIndex))

  return { rows: dedupedRows, errors }
}
