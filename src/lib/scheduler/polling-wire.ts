import type { SafeResyncSchedule } from '@/lib/apic/schedule-view'

export type SchedulePollingRow = Omit<SafeResyncSchedule, 'lastRunAt' | 'nextRunAt'> & {
  lastRunAt: string | null
  nextRunAt: string | null
}

export function serializeSchedulePollingSnapshot(
  schedules: SafeResyncSchedule[],
): SchedulePollingRow[] {
  return schedules.map(schedule => ({
    ...schedule,
    lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
    nextRunAt: schedule.nextRunAt?.toISOString() ?? null,
  }))
}

function parseDate(value: string | null): Date | null {
  if (value === null) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('Invalid scheduler timestamp')
  return date
}

export function parseSchedulePollingSnapshot(
  schedules: SchedulePollingRow[],
): SafeResyncSchedule[] {
  return schedules.map(schedule => ({
    ...schedule,
    lastRunAt: parseDate(schedule.lastRunAt),
    nextRunAt: parseDate(schedule.nextRunAt),
  }))
}
