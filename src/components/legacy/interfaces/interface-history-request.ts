import type { LegacyRange } from '@/lib/legacy/query'
import type { LegacyInterfaceHistory } from '@/lib/legacy/interfaces/query'

export async function fetchLegacyInterfaceHistory(
  interfaceId: string,
  options: { range: LegacyRange; page?: number },
): Promise<LegacyInterfaceHistory> {
  const search = new URLSearchParams({ interfaceId, range: options.range })
  if (options.page) search.set('page', String(options.page))
  const response = await fetch(`/api/legacy/interfaces/history?${search.toString()}`)
  if (!response.ok) {
    throw new Error(`Legacy interface history request failed with ${response.status}`)
  }
  return await response.json() as LegacyInterfaceHistory
}
