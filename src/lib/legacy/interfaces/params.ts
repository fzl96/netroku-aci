import { parseLegacyPage, parseLegacyPageSize, type LegacyPageSize } from '@/lib/legacy/query'

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

export type RawLegacyInterfaceParam = string | string[] | undefined
export type RawLegacyInterfaceListParams = {
  query?: RawLegacyInterfaceParam
  device?: RawLegacyInterfaceParam
  view?: RawLegacyInterfaceParam
  mode?: RawLegacyInterfaceParam
  window?: RawLegacyInterfaceParam
  sort?: RawLegacyInterfaceParam
  dir?: RawLegacyInterfaceParam
  page?: RawLegacyInterfaceParam
  pageSize?: RawLegacyInterfaceParam
  /** A URL can carry any key, including retired filters; they are ignored. */
  [key: string]: RawLegacyInterfaceParam
}

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

function uniqueDeviceIds(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ]
}

/** A repeated search param arrives as an array; the list state reads one value
 *  per control, so only the first occurrence is honoured. */
function first(value: RawLegacyInterfaceParam): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

export function parseLegacyInterfaceListState(
  params: RawLegacyInterfaceListParams,
): LegacyInterfaceListState {
  const sort = first(params.sort)
  const sortKey = LEGACY_INTERFACE_SORT_KEYS.includes(sort as LegacyInterfaceSortKey)
    ? (sort as LegacyInterfaceSortKey)
    : 'hostname'
  const direction = first(params.dir)
  const view = first(params.view)

  return {
    query: first(params.query),
    deviceIds: uniqueDeviceIds(first(params.device)),
    view: view === 'crc' || view === 'state-changed' ? view : 'all',
    mode: first(params.mode) === 'current' ? 'current' : 'delta',
    window: first(params.window) === '30d' ? '30d' : '7d',
    sortKey,
    sortDirection:
      direction === 'asc' || direction === 'desc'
        ? direction
        : initialLegacyInterfaceSortDirection(sortKey),
    page: parseLegacyPage(first(params.page) || undefined),
    pageSize: parseLegacyPageSize(first(params.pageSize) || undefined),
  }
}

export function buildLegacyInterfaceUrl(state: LegacyInterfaceListState): string {
  const params = new URLSearchParams()
  const query = state.query.trim()
  const deviceIds = [...new Set(state.deviceIds.map((id) => id.trim()).filter(Boolean))]
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
