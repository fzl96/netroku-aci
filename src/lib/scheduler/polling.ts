'use server'

import type { SafeResyncSchedule } from '@/lib/apic/schedule-view'
import type { ScheduleRefreshResult } from '@/lib/apic/schedule-polling'
import { getResyncSchedules } from './query'

/** The mounted Scheduler page polls this on an interval. It is a read, not a
 *  mutation, so it lives here rather than in `actions.ts` — that file is
 *  reserved for browser-invoked writes. A Server Action (not a GET route) so
 *  `lastRunAt`/`nextRunAt` cross the boundary as real `Date` objects instead
 *  of degrading to ISO strings the way a `fetch()` JSON response would. */
export async function refreshResyncSchedules(): Promise<ScheduleRefreshResult<SafeResyncSchedule[]>> {
  try {
    return { success: true, data: await getResyncSchedules() }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
