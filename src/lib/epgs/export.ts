import * as XLSX from 'xlsx-js-style'
import type { EpgWithBindings } from './query'

export type EpgExportGrouping = 'epg' | 'port'

type Binding = EpgWithBindings['bindings'][number]

const EXCEL_INVALID_SHEET_CHARS = /[:\\/?*[\]]/g
const MAX_SHEET_NAME_LENGTH = 31

const NATURAL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

const EPG_COLUMNS = [
  'EPG',
  'Tenant',
  'Bridge Domain',
  'EPG Description',
  'Consumed',
  'Provided',
  'Node',
  'Port',
] as const

const PORT_COLUMNS = ['Node', 'Port', 'EPG'] as const

/** Split a stored node value ("1103-1104") into individual leaf nodes. */
export function expandNodeLeaves(node: string): string[] {
  return node
    .split('-')
    .map(leaf => leaf.trim())
    .filter(Boolean)
}

export function sanitizeWorksheetName(value: string): string {
  const sanitized = value
    .replace(EXCEL_INVALID_SHEET_CHARS, '-')
    .replace(/-+/g, '-')
    .trim()
    .slice(0, MAX_SHEET_NAME_LENGTH)

  return sanitized || 'Unassigned'
}

function uniqueWorksheetName(rawName: string, usedNames: Set<string>): string {
  const base = sanitizeWorksheetName(rawName)
  let candidate = base
  let suffix = 2

  while (usedNames.has(candidate)) {
    const nextSuffix = `-${suffix}`
    candidate = `${base.slice(0, MAX_SHEET_NAME_LENGTH - nextSuffix.length)}${nextSuffix}`
    suffix += 1
  }

  usedNames.add(candidate)
  return candidate
}

/**
 * Keep only bindings whose leaf nodes intersect the selected nodes, dropping
 * EPGs left with no matching bindings. Used for the "current filters" scope
 * when a node filter is active.
 */
export function filterEpgsByNode(
  epgs: EpgWithBindings[],
  nodes: string[],
): EpgWithBindings[] {
  if (nodes.length === 0) return epgs
  const selected = new Set(nodes)

  const result: EpgWithBindings[] = []
  for (const epg of epgs) {
    const bindings = epg.bindings.filter(b =>
      expandNodeLeaves(b.node).some(leaf => selected.has(leaf)),
    )
    if (bindings.length > 0) result.push({ ...epg, bindings })
  }
  return result
}

function sortedEpgs(epgs: EpgWithBindings[]): EpgWithBindings[] {
  return [...epgs].sort(
    (a, b) =>
      NATURAL_COLLATOR.compare(a.tenant, b.tenant) ||
      NATURAL_COLLATOR.compare(a.name, b.name),
  )
}

/** Leaf node -> naturally-sorted ports, expanding vPC bindings into each leaf. */
function bindingsByLeafNode(bindings: Binding[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const b of bindings) {
    const port = b.port.trim() || '—'
    for (const leaf of expandNodeLeaves(b.node)) {
      const ports = map.get(leaf) ?? []
      if (!ports.includes(port)) ports.push(port)
      map.set(leaf, ports)
    }
  }

  const ordered = new Map<string, string[]>()
  for (const leaf of Array.from(map.keys()).sort(NATURAL_COLLATOR.compare)) {
    ordered.set(leaf, map.get(leaf)!.sort(NATURAL_COLLATOR.compare))
  }
  return ordered
}

const CENTER_BOTH = { alignment: { horizontal: 'center', vertical: 'center' } } as const
const VERTICAL_CENTER = { alignment: { vertical: 'center' } } as const

type CellStyle = typeof CENTER_BOTH | typeof VERTICAL_CENTER

/** Apply `style` to every existing cell, choosing the style per (row, col). */
function applyCellStyles(
  ws: XLSX.WorkSheet,
  styleFor: (row: number, col: number) => CellStyle,
): void {
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })] as { s?: CellStyle } | undefined
      if (cell) cell.s = styleFor(r, c)
    }
  }
}

type MergeRange = { s: { r: number; c: number }; e: { r: number; c: number } }

function finalizeSheet(
  rows: unknown[][],
  merges: MergeRange[],
  colWidths: number[],
): XLSX.WorkSheet {
  const worksheet = XLSX.utils.aoa_to_sheet(rows)
  if (merges.length > 0) worksheet['!merges'] = merges
  worksheet['!cols'] = colWidths.map(wch => ({ wch }))
  return worksheet
}

function buildEpgSheet(epgs: EpgWithBindings[]): XLSX.WorkSheet {
  const rows: unknown[][] = [[...EPG_COLUMNS]]
  const merges: MergeRange[] = []

  for (const epg of sortedEpgs(epgs)) {
    const byNode = bindingsByLeafNode(epg.bindings)
    const epgStartRow = rows.length
    const detail = [
      epg.name,
      epg.tenant,
      epg.bridgeDomain,
      epg.description,
      epg.consumedContracts.join(', '),
      epg.providedContracts.join(', '),
    ]

    if (byNode.size === 0) {
      rows.push([...detail, '', ''])
    } else {
      let first = true
      for (const [node, ports] of byNode) {
        const nodeStartRow = rows.length
        ports.forEach((port, i) => {
          rows.push([
            ...(first && i === 0 ? detail : ['', '', '', '', '', '']),
            i === 0 ? node : '',
            port,
          ])
        })
        if (ports.length > 1) {
          merges.push({ s: { r: nodeStartRow, c: 6 }, e: { r: nodeStartRow + ports.length - 1, c: 6 } })
        }
        first = false
      }
    }

    const epgEndRow = rows.length - 1
    if (epgEndRow > epgStartRow) {
      for (let c = 0; c < 6; c += 1) {
        merges.push({ s: { r: epgStartRow, c }, e: { r: epgEndRow, c } })
      }
    }
  }

  const worksheet = finalizeSheet(rows, merges, [28, 16, 18, 30, 24, 24, 12, 14])
  // Header and detail columns centered; EPG (0) and Port (7) only vertically centered.
  applyCellStyles(worksheet, (r, c) =>
    r === 0 || (c !== 0 && c !== 7) ? CENTER_BOTH : VERTICAL_CENTER,
  )
  return worksheet
}

/** Leaf node -> (port -> EPG names on that port). */
function portsByLeafNode(epgs: EpgWithBindings[]): Map<string, Map<string, Set<string>>> {
  const nodes = new Map<string, Map<string, Set<string>>>()
  for (const epg of epgs) {
    for (const b of epg.bindings) {
      const port = b.port.trim() || '—'
      for (const leaf of expandNodeLeaves(b.node)) {
        const ports = nodes.get(leaf) ?? new Map<string, Set<string>>()
        const epgNames = ports.get(port) ?? new Set<string>()
        epgNames.add(epg.name)
        ports.set(port, epgNames)
        nodes.set(leaf, ports)
      }
    }
  }
  return nodes
}

function buildPortSheet(node: string, ports: Map<string, Set<string>>): XLSX.WorkSheet {
  const rows: unknown[][] = [[...PORT_COLUMNS]]
  const orderedPorts = Array.from(ports.keys()).sort(NATURAL_COLLATOR.compare)

  orderedPorts.forEach((port, i) => {
    const epgNames = Array.from(ports.get(port)!).sort(NATURAL_COLLATOR.compare)
    rows.push([i === 0 ? node : '', port, epgNames.join(', ')])
  })

  const merges: MergeRange[] = orderedPorts.length > 1
    ? [{ s: { r: 1, c: 0 }, e: { r: orderedPorts.length, c: 0 } }]
    : []

  const worksheet = finalizeSheet(rows, merges, [12, 16, 40])
  // Header and Node centered; Port and EPG only vertically centered.
  applyCellStyles(worksheet, (r, c) =>
    r === 0 || c === 0 ? CENTER_BOTH : VERTICAL_CENTER,
  )
  return worksheet
}

export function buildEpgWorkbook(
  epgs: EpgWithBindings[],
  groupBy: EpgExportGrouping,
): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new()

  if (groupBy === 'epg') {
    XLSX.utils.book_append_sheet(workbook, buildEpgSheet(epgs), 'EPGs')
    return workbook
  }

  const nodes = portsByLeafNode(epgs)
  const usedNames = new Set<string>()
  for (const node of Array.from(nodes.keys()).sort(NATURAL_COLLATOR.compare)) {
    const sheet = buildPortSheet(node, nodes.get(node)!)
    XLSX.utils.book_append_sheet(workbook, sheet, uniqueWorksheetName(node, usedNames))
  }

  return workbook
}
