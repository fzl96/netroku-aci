import type { Endpoint } from '@prisma/client'
import * as XLSX from 'xlsx'

export type EndpointExportGrouping = 'node' | 'vlan'

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
  endpoints: Endpoint[],
  groupBy: EndpointExportGrouping,
): Map<string, Endpoint[]> {
  const grouped = new Map<string, Endpoint[]>()

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

function toExportRow(endpoint: Endpoint) {
  return {
    MAC: endpoint.mac,
    IP: endpoint.ip || '',
    VLAN: endpoint.vlan,
    Node: endpoint.node || '',
    Interface: endpoint.interface || '',
    'EPG Description': endpoint.epgDescr || '',
    'First Seen': endpoint.firstSeenAt,
    'Last Seen': endpoint.lastSeenAt,
    Status: endpoint.isActive ? 'Active' : 'Historical',
  }
}

export function buildEndpointWorkbook(
  endpoints: Endpoint[],
  groupBy: EndpointExportGrouping,
): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new()
  const grouped = groupEndpointsForExport(endpoints, groupBy)
  const usedNames = new Set<string>()

  for (const [groupName, rows] of grouped) {
    const orderedRows = [...rows].sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
    const worksheet = XLSX.utils.json_to_sheet(
      orderedRows.map(toExportRow),
      { header: [...EXPORT_COLUMNS], cellDates: true },
    )

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
