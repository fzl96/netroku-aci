export type ScheduleRefreshResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export type PollingTimers = {
  setInterval: (callback: () => void, milliseconds: number) => ReturnType<typeof setInterval>
  clearInterval: (handle: ReturnType<typeof setInterval>) => void
}

const DEFAULT_TIMERS: PollingTimers = {
  setInterval: (callback, milliseconds) => globalThis.setInterval(callback, milliseconds),
  clearInterval: (handle) => globalThis.clearInterval(handle),
}

/** Refresh a mounted scheduler snapshot without surfacing transient polling errors. */
export function startSchedulePolling<T>(input: {
  load: () => Promise<ScheduleRefreshResult<T>>
  onSnapshot: (snapshot: T) => void
  getMutationVersion?: () => number
  isMutationPending?: () => boolean
  intervalMs?: number
  timers?: PollingTimers
}): () => void {
  const timers = input.timers ?? DEFAULT_TIMERS
  let disposed = false
  let refreshing = false

  const refresh = async () => {
    if (refreshing || input.isMutationPending?.()) return
    refreshing = true
    const mutationVersion = input.getMutationVersion?.()
    try {
      const result = await input.load()
      const mutationUnchanged = mutationVersion === input.getMutationVersion?.()
      if (!disposed && mutationUnchanged && result.success) input.onSnapshot(result.data)
    } catch {
      // Preserve the last good snapshot; the next interval retries.
    } finally {
      refreshing = false
    }
  }

  const handle = timers.setInterval(refresh, input.intervalMs ?? 10_000)
  return () => {
    disposed = true
    timers.clearInterval(handle)
  }
}
