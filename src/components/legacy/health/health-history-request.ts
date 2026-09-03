import type { LegacyRange } from '@/lib/legacy/query'
import type { LegacyHealthHistory } from '@/lib/legacy/health/query'

export async function fetchLegacyHealthHistory(
  deviceId: string,
  options: { range: LegacyRange; samplePage?: number; logPage?: number },
): Promise<LegacyHealthHistory> {
  const search = new URLSearchParams({ deviceId, range: options.range })
  if (options.samplePage) search.set('samplePage', String(options.samplePage))
  if (options.logPage) search.set('logPage', String(options.logPage))
  const response = await fetch(`/api/legacy/health/history?${search.toString()}`)
  if (!response.ok) {
    throw new Error(`Legacy health history request failed with ${response.status}`)
  }
  return await response.json() as LegacyHealthHistory
}
