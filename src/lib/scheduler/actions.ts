'use server'

import type { ResyncScheduleUpdateFormValues } from '@/lib/schemas/resync-schedule'
import type { SafeResyncSchedule } from '@/lib/apic/schedule-view'
import {
  deleteResyncScheduleRecord,
  runResyncScheduleNowRecord,
  upsertResyncScheduleRecord,
} from './mutation'
import { getResyncSchedules } from './query'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

/** Uncached snapshot for the mounted Scheduler page's background refresh loop. */
export async function refreshResyncSchedules(): Promise<ActionResult<SafeResyncSchedule[]>> {
  try {
    return { success: true, data: await getResyncSchedules() }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function upsertResyncSchedule(
  apicHostId: string,
  data: ResyncScheduleUpdateFormValues,
): Promise<ActionResult<SafeResyncSchedule>> {
  try {
    return { success: true, data: await upsertResyncScheduleRecord(apicHostId, data) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function runResyncScheduleNow(apicHostId: string): Promise<ActionResult<SafeResyncSchedule>> {
  try {
    return { success: true, data: await runResyncScheduleNowRecord(apicHostId) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteResyncSchedule(apicHostId: string): Promise<ActionResult<void>> {
  try {
    await deleteResyncScheduleRecord(apicHostId)
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
