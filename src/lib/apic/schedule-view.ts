import { decrypt } from '@/lib/crypto'
import { DEFAULT_INTERVAL_MINUTES, isScheduleOverdue } from './schedule-timing'

/**
 * Sentinel substituted for a schedule's username when its `encUsername` fails to decrypt.
 * Never a real APIC username — callers must recognize and strip it rather than round-tripping
 * it back into storage (which would `encrypt()` the literal string as though it were real).
 */
export const UNREADABLE_USERNAME = '(unreadable)'

export type SafeResyncSchedule = {
  apicHostId: string
  hostName: string
  host: string
  enabled: boolean
  intervalMinutes: number
  username: string
  hasPassword: boolean
  lastRunAt: Date | null
  lastStatus: string | null
  lastDetail: string | null
  nextRunAt: Date | null
  isRunning: boolean
  isOverdue: boolean
}

export type ScheduleRow = {
  enabled: boolean
  intervalMinutes: number
  encUsername: string
  encPassword: string
  nextRunAt: Date | null
  lastRunAt: Date | null
  lastStatus: string | null
  lastDetail: string | null
  runningAt: Date | null
}

/**
 * Serialization boundary. Ciphertext must never cross it — `decryptFn` is injected so this
 * stays a pure function under test.
 */
export function toSafeSchedule(
  host: { id: string; name: string; host: string },
  schedule: ScheduleRow | null,
  decryptFn: (value: string) => string = decrypt,
  now: Date = new Date(),
): SafeResyncSchedule {
  if (!schedule) {
    return {
      apicHostId: host.id,
      hostName: host.name,
      host: host.host,
      enabled: false,
      intervalMinutes: DEFAULT_INTERVAL_MINUTES,
      username: '',
      hasPassword: false,
      lastRunAt: null,
      lastStatus: null,
      lastDetail: null,
      nextRunAt: null,
      isRunning: false,
      isOverdue: false,
    }
  }

  let username: string
  try {
    username = decryptFn(schedule.encUsername)
  } catch {
    username = UNREADABLE_USERNAME
  }

  return {
    apicHostId: host.id,
    hostName: host.name,
    host: host.host,
    enabled: schedule.enabled,
    intervalMinutes: schedule.intervalMinutes,
    username,
    hasPassword: schedule.encPassword.length > 0,
    lastRunAt: schedule.lastRunAt,
    lastStatus: schedule.lastStatus,
    lastDetail: schedule.lastDetail,
    nextRunAt: schedule.nextRunAt,
    isRunning: schedule.runningAt !== null,
    isOverdue: isScheduleOverdue(
      { enabled: schedule.enabled, nextRunAt: schedule.nextRunAt, intervalMinutes: schedule.intervalMinutes },
      now,
    ),
  }
}
