import type { EndpointFilters } from '@/lib/endpoints/query'
import type { EndpointExportRequest } from '@/lib/schemas/endpoint-export'

export type ExportScope = EndpointExportRequest['scope']
export type ExportGrouping = EndpointExportRequest['groupBy']

export function getDefaultExportScope(
  hasActiveFilters: boolean,
  filteredTotal: number,
): ExportScope {
  return hasActiveFilters && filteredTotal > 0 ? 'filtered' : 'all'
}

export function buildEndpointExportPayload({
  apicHostId,
  scope,
  groupBy,
  filters,
}: {
  apicHostId: string
  scope: ExportScope
  groupBy: ExportGrouping
  filters: EndpointFilters
}): EndpointExportRequest {
  if (scope === 'all') {
    return { apicHostId, scope, groupBy }
  }

  return { apicHostId, scope, groupBy, filters }
}
