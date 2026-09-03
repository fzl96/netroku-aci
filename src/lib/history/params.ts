import type { AuditAction } from '@/lib/audit'

export const HISTORY_PAGE_SIZE = 20

export const HISTORY_ACTION_LABELS: Record<AuditAction, string> = {
  'apic_host.create': 'Host added',
  'apic_host.update': 'Host updated',
  'apic_host.delete': 'Host deleted',
  deploy: 'Deploy',
  rollback: 'Rollback',
  'resync.endpoints': 'Resync endpoints',
  'resync.interfaces': 'Resync interfaces',
  'resync.faults': 'Resync faults',
  'resync.health': 'Resync health',
  'resync.nodes': 'Resync nodes',
  'resync.epgs': 'Resync EPGs',
  'ingest.legacy.health': 'Ingest legacy health',
  'ingest.legacy.interfaces': 'Ingest legacy interfaces',
  'ingest.legacy.endpoints': 'Ingest legacy endpoints',
  'user.create': 'User created',
  'user.delete': 'User deleted',
  'resync.schedule.run': 'Ran scheduled resync',
  'resync.schedule.update': 'Resync schedule updated',
  'resync.schedule.delete': 'Resync schedule deleted',
  'site.create': 'Site added',
  'site.update': 'Site updated',
  'site.delete': 'Site deleted',
  'rack.create': 'Rack added',
  'rack.update': 'Rack updated',
  'rack.delete': 'Rack deleted',
  'device.create': 'Device added',
  'device.update': 'Device updated',
  'device.delete': 'Device deleted',
  'device.place': 'Device placed in rack',
  'device.unassign': 'Device removed from rack',
  'device.resize': 'Device resized',
  'device.import': 'Devices imported',
}

export const HISTORY_ACTIONS = Object.keys(HISTORY_ACTION_LABELS) as AuditAction[]

export type HistoryActionFilter = AuditAction | 'all'
export type RawHistoryPageParam = string | string[] | undefined
export type RawHistoryPageParams = {
  query?: RawHistoryPageParam
  action?: RawHistoryPageParam
  page?: RawHistoryPageParam
}
export type HistoryPageParams = {
  query: string
  action: HistoryActionFilter
  page: number
}

function first(value: RawHistoryPageParam): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

function positivePage(value: string): number {
  if (!/^\d+$/.test(value)) return 1
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1
}

export function parseHistoryPageParams(input: RawHistoryPageParams): HistoryPageParams {
  const action = first(input.action)
  return {
    query: first(input.query),
    action: HISTORY_ACTIONS.includes(action as AuditAction) ? (action as AuditAction) : 'all',
    page: positivePage(first(input.page)),
  }
}

export function clampHistoryPage(page: number, total: number): number {
  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE))
  return Math.min(Math.max(1, page), totalPages)
}

export function historyPageWindow(page: number, total: number) {
  const effectivePage = clampHistoryPage(page, total)
  return {
    page: effectivePage,
    skip: (effectivePage - 1) * HISTORY_PAGE_SIZE,
    take: HISTORY_PAGE_SIZE,
  }
}

export function buildHistoryUrl(params: HistoryPageParams): string {
  const search = new URLSearchParams()
  if (params.query.trim()) search.set('query', params.query.trim())
  if (params.action !== 'all') search.set('action', params.action)
  if (params.page > 1) search.set('page', String(params.page))
  const query = search.toString()
  return `/history${query ? `?${query}` : ''}`
}
