import type { ServiceResult } from './evaluate'

export type ConfigMetadata = { id: string; platform: string; collectedAt: Date }
export type ComplianceTarget = {
  id: string
  kind: 'device' | 'stack'
  name: string
  members: Array<{ id: string; name: string }>
  aciLinked: boolean
  config: ConfigMetadata | null
}
export type ComplianceRow = Omit<ComplianceTarget, 'config' | 'aciLinked'> & {
  platform: string | null
  collectedAt: string | null
  results: ServiceResult[]
}
export const COMPLIANCE_PAGE_SIZE = 20
export type ReportParams = { query: string; page: number }

export function parseReportParams(
  input: Record<string, string | string[] | undefined>,
): ReportParams {
  const first = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value) ?? ''
  const page = Number(first(input.page))
  return { query: first(input.q).trim(), page: Number.isSafeInteger(page) && page > 0 ? page : 1 }
}

export function reportUrl(params: ReportParams): string {
  const query = new URLSearchParams()
  if (params.query) query.set('q', params.query)
  if (params.page > 1) query.set('page', String(params.page))
  return `/inventory/compliance${query.size ? `?${query}` : ''}`
}

export function reportWindow(targets: ComplianceTarget[], params: ReportParams) {
  const query = params.query.toLowerCase()
  const filtered = targets
    .filter(
      (target) =>
        !query ||
        target.name.toLowerCase().includes(query) ||
        target.members.some((member) => member.name.toLowerCase().includes(query)),
    )
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id),
    )
  const totalPages = Math.max(1, Math.ceil(filtered.length / COMPLIANCE_PAGE_SIZE))
  const page = Math.min(params.page, totalPages)
  return {
    targets: filtered.slice((page - 1) * COMPLIANCE_PAGE_SIZE, page * COMPLIANCE_PAGE_SIZE),
    total: filtered.length,
    page,
    totalPages,
  }
}
