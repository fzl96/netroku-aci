import type { EpgFilters } from './params'
import type { EpgExportRequest } from '@/lib/schemas/epg-export'

export type ExportScope = EpgExportRequest['scope']
export type ExportGrouping = EpgExportRequest['groupBy']
export function getDefaultExportScope(active: boolean, filteredTotal: number): ExportScope {
  return active && filteredTotal > 0 ? 'filtered' : 'all'
}
export function buildEpgExportPayload(input: {
  apicHostId: string; scope: ExportScope; groupBy: ExportGrouping; filters: EpgFilters
}): EpgExportRequest {
  return input.scope === 'all'
    ? { apicHostId: input.apicHostId, scope: input.scope, groupBy: input.groupBy }
    : input
}
