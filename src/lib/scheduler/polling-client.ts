import type { SafeResyncSchedule } from '@/lib/apic/schedule-view'
import type { ScheduleRefreshResult } from '@/lib/apic/schedule-polling'
import { parseSchedulePollingSnapshot, type SchedulePollingRow } from './polling-wire'

const POLLING_ERROR = 'Unable to load resync schedules'

type PollingPayload = {
  data?: SchedulePollingRow[]
  error?: string
}

type SchedulePollingFetcher = (input: string, init?: RequestInit) => Promise<Response>

export async function refreshResyncSchedules(
  fetcher: SchedulePollingFetcher = fetch,
): Promise<ScheduleRefreshResult<SafeResyncSchedule[]>> {
  try {
    const response = await fetcher('/api/scheduler', { cache: 'no-store' })
    const payload = (await response.json()) as PollingPayload
    if (!response.ok) {
      return {
        success: false,
        error: typeof payload.error === 'string' ? payload.error : POLLING_ERROR,
      }
    }
    if (!Array.isArray(payload.data)) return { success: false, error: POLLING_ERROR }
    return { success: true, data: parseSchedulePollingSnapshot(payload.data) }
  } catch {
    return { success: false, error: POLLING_ERROR }
  }
}
