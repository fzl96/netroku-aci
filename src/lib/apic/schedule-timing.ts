/** Smallest interval an operator may configure — guards the APICs from being hammered. */
export const INTERVAL_MIN_MINUTES = 15
/** Largest interval an operator may configure (1 week). */
export const INTERVAL_MAX_MINUTES = 10080
/** Default for a new schedule — matches the systemd timer this replaces. */
export const DEFAULT_INTERVAL_MINUTES = 480
/**
 * A claim older than this is treated as abandoned (container died mid-run).
 * Must exceed the longest plausible single-host resync.
 */
export const STALE_CLAIM_MINUTES = 120

const MINUTE_MS = 60_000

/** Next run is measured from when the previous run *finished*, not when it was due. */
export function computeNextRunAt(completedAt: Date, intervalMinutes: number): Date {
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
    throw new Error('intervalMinutes must be a positive number')
  }
  return new Date(completedAt.getTime() + intervalMinutes * MINUTE_MS)
}

/** True when a held claim is old enough to be considered abandoned. */
export function isClaimStale(
  runningAt: Date | null,
  now: Date,
  staleAfterMinutes: number = STALE_CLAIM_MINUTES,
): boolean {
  if (!runningAt) return false
  return now.getTime() - runningAt.getTime() > staleAfterMinutes * MINUTE_MS
}

/**
 * Mirror of the SQL claim predicate in schedule-claim.ts.
 * Kept pure so the rules are unit-tested; the SQL is the enforcement point.
 */
export function isScheduleDue(
  schedule: { enabled: boolean; nextRunAt: Date | null; runningAt: Date | null },
  now: Date,
  staleAfterMinutes: number = STALE_CLAIM_MINUTES,
): boolean {
  if (!schedule.enabled) return false
  if (!schedule.nextRunAt) return false
  if (schedule.nextRunAt.getTime() > now.getTime()) return false
  if (schedule.runningAt && !isClaimStale(schedule.runningAt, now, staleAfterMinutes)) return false
  return true
}

/**
 * True when an enabled schedule is more than 2x its interval late — surfaced in the UI
 * so a dead ticker is distinguishable from a healthy idle one.
 */
export function isScheduleOverdue(
  schedule: { enabled: boolean; nextRunAt: Date | null; intervalMinutes: number },
  now: Date,
): boolean {
  if (!schedule.enabled || !schedule.nextRunAt) return false
  const graceMs = 2 * schedule.intervalMinutes * MINUTE_MS
  return now.getTime() - schedule.nextRunAt.getTime() > graceMs
}
