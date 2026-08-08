import {
  parseLegacyPage,
  parseLegacyPageSize,
  type LegacyPageSize,
} from '@/lib/legacy-ui/query'

export type LegacyInterfaceView = 'all' | 'crc' | 'state-changed'
export type LegacyInterfaceCounterMode = 'delta' | 'current'
export type LegacyInterfaceWindow = '7d' | '30d'
export type LegacyInterfaceSortKey =
  | 'hostname'
  | 'ifName'
  | 'description'
  | 'ipAddress'
  | 'speed'
  | 'adminSt'
  | 'operSt'
  | 'inputErrors'
  | 'outputErrors'
  | 'crcErrors'
  | 'collectedAt'
export type LegacyInterfaceSortDirection = 'asc' | 'desc'

export const LEGACY_INTERFACE_SORT_KEYS = [
  'hostname',
  'ifName',
  'description',
  'ipAddress',
  'speed',
  'adminSt',
  'operSt',
  'inputErrors',
  'outputErrors',
  'crcErrors',
  'collectedAt',
] as const satisfies readonly LegacyInterfaceSortKey[]

const DESCENDING_FIRST = new Set<LegacyInterfaceSortKey>([
  'speed',
  'inputErrors',
  'outputErrors',
  'crcErrors',
  'collectedAt',
])

export interface LegacyInterfaceListState {
  query: string
  deviceIds: string[]
  view: LegacyInterfaceView
  mode: LegacyInterfaceCounterMode
  window: LegacyInterfaceWindow
  sortKey: LegacyInterfaceSortKey
  sortDirection: LegacyInterfaceSortDirection
  page: number
  pageSize: LegacyPageSize
}

export function initialLegacyInterfaceSortDirection(
  key: LegacyInterfaceSortKey,
): LegacyInterfaceSortDirection {
  return DESCENDING_FIRST.has(key) ? 'desc' : 'asc'
}

function uniqueDeviceIds(value?: string): string[] {
  return [...new Set((value ?? '').split(',').map(id => id.trim()).filter(Boolean))]
}

export function parseLegacyInterfaceListState(params: Record<string, string | undefined>): LegacyInterfaceListState {
  const sortKey = LEGACY_INTERFACE_SORT_KEYS.includes(params.sort as LegacyInterfaceSortKey)
    ? params.sort as LegacyInterfaceSortKey
    : 'hostname'
  const defaultDirection = initialLegacyInterfaceSortDirection(sortKey)
  const sortDirection = params.dir === 'asc' || params.dir === 'desc'
    ? params.dir
    : defaultDirection

  return {
    query: params.query?.trim() ?? '',
    deviceIds: uniqueDeviceIds(params.device),
    view: params.view === 'crc' || params.view === 'state-changed' ? params.view : 'all',
    mode: params.mode === 'current' ? 'current' : 'delta',
    window: params.window === '30d' ? '30d' : '7d',
    sortKey,
    sortDirection,
    page: parseLegacyPage(params.page),
    pageSize: parseLegacyPageSize(params.pageSize),
  }
}

export function buildLegacyInterfaceUrl(state: LegacyInterfaceListState): string {
  const params = new URLSearchParams()
  const query = state.query.trim()
  const deviceIds = [...new Set(state.deviceIds.map(id => id.trim()).filter(Boolean))]
  const initialDirection = initialLegacyInterfaceSortDirection(state.sortKey)

  if (query) params.set('query', query)
  if (deviceIds.length) params.set('device', deviceIds.join(','))
  if (state.view !== 'all') params.set('view', state.view)
  if (state.mode !== 'delta') params.set('mode', state.mode)
  if (state.view !== 'all' && state.window !== '7d') params.set('window', state.window)
  if (state.sortKey !== 'hostname' || state.sortDirection !== 'asc') {
    params.set('sort', state.sortKey)
  }
  if (state.sortDirection !== initialDirection) params.set('dir', state.sortDirection)
  if (state.page > 1) params.set('page', String(state.page))
  if (state.pageSize !== 50) params.set('pageSize', String(state.pageSize))

  const queryString = params.toString()
  return `/legacy/interfaces${queryString ? `?${queryString}` : ''}`
}

export function mergeLegacyInterfaceListState(
  current: LegacyInterfaceListState,
  overrides: Partial<LegacyInterfaceListState>,
): LegacyInterfaceListState {
  return {
    ...current,
    ...overrides,
    page: overrides.page ?? 1,
  }
}

export function nextLegacyInterfaceSort(
  currentKey: LegacyInterfaceSortKey,
  currentDirection: LegacyInterfaceSortDirection,
  nextKey: LegacyInterfaceSortKey,
): { key: LegacyInterfaceSortKey; direction: LegacyInterfaceSortDirection } {
  if (currentKey === nextKey) {
    return { key: nextKey, direction: currentDirection === 'asc' ? 'desc' : 'asc' }
  }
  return { key: nextKey, direction: initialLegacyInterfaceSortDirection(nextKey) }
}
