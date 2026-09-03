export const NODE_PAGE_SIZES = [10, 50, 100, 1000] as const
export const NODE_ROLES = ['leaf', 'spine', 'controller'] as const
export const NODE_COMPONENT_TYPES = ['psu', 'fan'] as const

export type NodeView = 'nodes' | 'components'
export type NodePageSize = (typeof NODE_PAGE_SIZES)[number] | 'all'
export type NodeRole = (typeof NODE_ROLES)[number]
export type NodeComponentType = (typeof NODE_COMPONENT_TYPES)[number]
export type RawNodePageParam = string | string[] | undefined
export type RawNodePageParams = {
  apic?: RawNodePageParam
  query?: RawNodePageParam
  view?: RawNodePageParam
  role?: RawNodePageParam
  type?: RawNodePageParam
  page?: RawNodePageParam
  pageSize?: RawNodePageParam
}

export type NodePageParams = {
  hostId: string
  query: string
  view: NodeView
  role: NodeRole | null
  componentType: NodeComponentType | null
  page: number
  pageSize: NodePageSize
}

function first(value: RawNodePageParam): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

function positivePage(value: string): number {
  if (!/^\d+$/.test(value)) return 1
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1
}

function pageSize(value: string): NodePageSize {
  if (value === 'all') return 'all'
  const parsed = Number(value)
  return (NODE_PAGE_SIZES as readonly number[]).includes(parsed) ? (parsed as NodePageSize) : 50
}

export function parseNodePageParams(input: RawNodePageParams): NodePageParams {
  const view: NodeView = first(input.view) === 'components' ? 'components' : 'nodes'
  const role = first(input.role)
  const componentType = first(input.type)
  return {
    hostId: first(input.apic),
    query: first(input.query),
    view,
    role:
      view === 'nodes' && (NODE_ROLES as readonly string[]).includes(role)
        ? (role as NodeRole)
        : null,
    componentType:
      view === 'components' && (NODE_COMPONENT_TYPES as readonly string[]).includes(componentType)
        ? (componentType as NodeComponentType)
        : null,
    page: positivePage(first(input.page)),
    pageSize: pageSize(first(input.pageSize)),
  }
}

export function buildNodePageUrl(params: NodePageParams): string {
  const search = new URLSearchParams()
  if (params.hostId) search.set('apic', params.hostId)
  if (params.view !== 'nodes') search.set('view', params.view)
  if (params.query) search.set('query', params.query)
  if (params.role && params.view === 'nodes') search.set('role', params.role)
  if (params.componentType && params.view === 'components') search.set('type', params.componentType)
  if (params.page > 1) search.set('page', String(params.page))
  if (params.pageSize !== 50) search.set('pageSize', String(params.pageSize))
  const value = search.toString()
  return `/nodes${value ? `?${value}` : ''}`
}
