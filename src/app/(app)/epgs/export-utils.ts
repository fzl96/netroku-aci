import type { BindingFilters } from '@/lib/epgs/query'
import type { EpgExportRequest } from '@/lib/schemas/epg-export'

export type ExportScope = EpgExportRequest['scope']
export type ExportGrouping = EpgExportRequest['groupBy']

export function getDefaultExportScope(
  hasActiveFilters: boolean,
  filteredTotal: number,
): ExportScope {
  return hasActiveFilters && filteredTotal > 0 ? 'filtered' : 'all'
}

export function buildEpgExportPayload({
  apicHostId,
  scope,
  groupBy,
  filters,
}: {
  apicHostId: string
  scope: ExportScope
  groupBy: ExportGrouping
  filters: BindingFilters
}): EpgExportRequest {
  if (scope === 'all') {
    return { apicHostId, scope, groupBy }
  }

  return { apicHostId, scope, groupBy, filters }
}
