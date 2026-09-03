import * as XLSX from 'xlsx'

export type EndpointExportGrouping = 'node' | 'vlan'

export type EndpointExportRow = {
  id: string
  mac: string
  ip: string
  vlan: string
  dn: string
  node: string
  interface: string
  epgDescr: string
  isActive: boolean
  firstSeenAt: string
  lastSeenAt: string
  clearedAt: string | null
}

const EXCEL_INVALID_SHEET_CHARS = /[:\\/?*[\]]/g
const MAX_SHEET_NAME_LENGTH = 31

const EXPORT_COLUMNS = [
  'MAC',
  'IP',
  'VLAN',
  'Node',
  'Interface',
  'EPG Description',
  'First Seen',
  'Last Seen',
  'Status',
] as const

export function sanitizeWorksheetName(value: string): string {
  const sanitized = value
    .replace(EXCEL_INVALID_SHEET_CHARS, '-')
    .replace(/-+/g, '-')
    .trim()
    .slice(0, MAX_SHEET_NAME_LENGTH)

  return sanitized || 'Unassigned'
}

export function groupEndpointsForExport(
  endpoints: EndpointExportRow[],
  groupBy: EndpointExportGrouping,
): Map<string, EndpointExportRow[]> {
  const grouped = new Map<string, EndpointExportRow[]>()

  for (const endpoint of endpoints) {
    const rawKey = groupBy === 'node' ? endpoint.node : endpoint.vlan
    const key = rawKey.trim() || 'Unassigned'
    const bucket = grouped.get(key) ?? []
    bucket.push(endpoint)
    grouped.set(key, bucket)
  }

  return grouped
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

function excelDate(value: string): Date | '' {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date
}

function timestamp(value: string): number {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed
}

function toExportRow(endpoint: EndpointExportRow) {
  return {
    MAC: endpoint.mac,
    IP: endpoint.ip || '',
    VLAN: endpoint.vlan,
    Node: endpoint.node || '',
    Interface: endpoint.interface || '',
    'EPG Description': endpoint.epgDescr || '',
    'First Seen': excelDate(endpoint.firstSeenAt),
    'Last Seen': excelDate(endpoint.lastSeenAt),
    Status: endpoint.isActive ? 'Active' : 'Historical',
  }
}

export function buildEndpointWorkbook(
  endpoints: EndpointExportRow[],
  groupBy: EndpointExportGrouping,
): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new()
  const grouped = groupEndpointsForExport(endpoints, groupBy)
  const usedNames = new Set<string>()

  for (const [groupName, rows] of grouped) {
    const orderedRows = [...rows].sort((a, b) => timestamp(b.lastSeenAt) - timestamp(a.lastSeenAt))
    const worksheet = XLSX.utils.json_to_sheet(orderedRows.map(toExportRow), {
      header: [...EXPORT_COLUMNS],
      cellDates: true,
    })

    worksheet['!cols'] = [
      { wch: 20 },
      { wch: 18 },
      { wch: 14 },
      { wch: 12 },
      { wch: 18 },
      { wch: 28 },
      { wch: 20 },
      { wch: 20 },
      { wch: 12 },
    ]

    XLSX.utils.book_append_sheet(workbook, worksheet, uniqueWorksheetName(groupName, usedNames))
  }

  return workbook
}

export function serializeEndpointWorkbook(workbook: XLSX.WorkBook): Uint8Array {
  const bytes = XLSX.write(workbook, {
    type: 'array',
    bookType: 'xlsx',
    cellDates: true,
  }) as ArrayBuffer
  return new Uint8Array(bytes)
}

function safeFilenameSegment(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'host'
  )
}

export function buildEndpointExportFilename({
  hostName,
  scope,
  groupBy,
  now = new Date(),
}: {
  hostName: string
  scope: 'all' | 'filtered'
  groupBy: EndpointExportGrouping
  now?: Date
}): string {
  const timestampPart = now.toISOString().replace(/[:.]/g, '-')
  return (
    ['endpoints', safeFilenameSegment(hostName), scope, `by-${groupBy}`, timestampPart].join('-') +
    '.xlsx'
  )
}
