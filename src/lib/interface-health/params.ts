import type { CounterMode } from './counter-mode'
import type { InterfaceView } from './interface-query'
import {
  parseInterfaceSortParams,
  type InterfaceSort,
  type InterfaceSortDirection,
} from './sort'

export const INTERFACE_PAGE_SIZES = [10, 50, 100, 1000] as const
export const CRC_WINDOW_SORT_KEY = 'crcWindowTotal'

export type InterfacePageSize = typeof INTERFACE_PAGE_SIZES[number] | 'all'
export type InterfaceWindow = '7d' | '30d'

/** How the result rows are ordered. The CRC view ranks by windowed CRC total
 *  unless the reader picked a counter column, which `sortInterfaceRows` owns. */
export type InterfaceTableSort =
  | { kind: 'natural' }
  | { kind: 'counter'; sort: InterfaceSort }
  | { kind: 'crc-window'; direction: InterfaceSortDirection }

export type RawInterfacePageParam = string | string[] | undefined
export type RawInterfaceHealthPageParams = {
  apic?: RawInterfacePageParam
  query?: RawInterfacePageParam
  node?: RawInterfacePageParam
  page?: RawInterfacePageParam
  pageSize?: RawInterfacePageParam
  sort?: RawInterfacePageParam
  dir?: RawInterfacePageParam
  mode?: RawInterfacePageParam
  view?: RawInterfacePageParam
  window?: RawInterfacePageParam
}

export type InterfaceHealthPageParams = {
  hostId: string
  query: string
  nodes: string[]
  page: number
  pageSize: InterfacePageSize
  view: InterfaceView
  window: InterfaceWindow
  counterMode: CounterMode
  sort: InterfaceTableSort
}

function first(value: RawInterfacePageParam): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

function positivePage(value: string): number {
  if (!/^\d+$/.test(value)) return 1
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1
}

function pageSize(value: string): InterfacePageSize {
  if (value === 'all') return 'all'
  const parsed = Number(value)
  return (INTERFACE_PAGE_SIZES as readonly number[]).includes(parsed)
    ? parsed as InterfacePageSize
    : 50
}

function view(value: string): InterfaceView {
  return value === 'crc' || value === 'state-changed' ? value : 'all'
}

export function interfaceWindowDays(window: InterfaceWindow): number {
  return window === '30d' ? 30 : 7
}

export function interfaceWindowStart(window: InterfaceWindow, now: Date): Date {
  return new Date(now.getTime() - interfaceWindowDays(window) * 24 * 60 * 60 * 1000)
}

export function parseInterfaceHealthPageParams(
  input: RawInterfaceHealthPageParams,
): InterfaceHealthPageParams {
  const rawNodes = first(input.node)
  const rawDir = first(input.dir)
  const rawMode = first(input.mode)
  const resolvedView = view(first(input.view))
  const counterMode: CounterMode = rawMode === 'current' ? 'current' : 'delta'
  const counterSort = parseInterfaceSortParams({
    sort: first(input.sort),
    dir: rawDir,
    mode: rawMode,
  })
  const direction: InterfaceSortDirection = rawDir === 'asc' ? 'asc' : 'desc'

  // In the CRC view, no explicit counter column means rank by windowed CRC total.
  const sort: InterfaceTableSort = resolvedView === 'crc' && counterSort === null
    ? { kind: 'crc-window', direction }
    : counterSort
      ? { kind: 'counter', sort: counterSort }
      : { kind: 'natural' }

  return {
    hostId: first(input.apic),
    query: first(input.query),
    nodes: rawNodes ? rawNodes.split(',').map(node => node.trim()).filter(Boolean) : [],
    page: positivePage(first(input.page)),
    pageSize: pageSize(first(input.pageSize)),
    view: resolvedView,
    window: first(input.window) === '30d' ? '30d' : '7d',
    counterMode,
    sort,
  }
}

export function buildInterfaceHealthPageUrl(params: InterfaceHealthPageParams): string {
  const search = new URLSearchParams()
  if (params.hostId) search.set('apic', params.hostId)
  if (params.view !== 'all') search.set('view', params.view)
  if (params.window !== '7d') search.set('window', params.window)
  if (params.query) search.set('query', params.query)
  if (params.nodes.length > 0) search.set('node', params.nodes.join(','))
  if (params.counterMode !== 'delta') search.set('mode', params.counterMode)
  if (params.sort.kind === 'counter') {
    search.set('sort', params.sort.sort.key)
    if (params.sort.sort.direction === 'asc') search.set('dir', 'asc')
  }
  if (params.sort.kind === 'crc-window' && params.sort.direction === 'asc') {
    search.set('sort', CRC_WINDOW_SORT_KEY)
    search.set('dir', 'asc')
  }
  if (params.page > 1) search.set('page', String(params.page))
  if (params.pageSize !== 50) search.set('pageSize', String(params.pageSize))
  const value = search.toString()
  return `/interface-health${value ? `?${value}` : ''}`
}
