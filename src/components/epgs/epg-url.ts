import {
  buildEpgPageUrl,
  type EpgPageParams,
  type EpgPageSize,
  type EpgView,
} from '@/lib/epgs/params'

export type EpgUrlOverrides = {
  apic?: string
  view?: EpgView
  query?: string
  page?: number
  pageSize?: EpgPageSize
  tenant?: string[]
  ap?: string[]
  node?: string[]
}

export function buildEpgUrl(params: EpgPageParams, overrides: EpgUrlOverrides): string {
  const view = overrides.view ?? params.view
  return buildEpgPageUrl({
    hostId: overrides.apic ?? params.hostId,
    view,
    query: overrides.query ?? params.query,
    page: overrides.page ?? params.page,
    pageSize: overrides.pageSize ?? params.pageSize,
    tenants: overrides.tenant ?? params.tenants,
    appProfiles: overrides.ap ?? params.appProfiles,
    nodes: view === 'port' ? (overrides.node ?? params.nodes) : [],
  })
}
