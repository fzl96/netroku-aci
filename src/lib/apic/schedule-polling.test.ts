import { describe, expect, it } from 'bun:test'
import { startSchedulePolling, type PollingTimers } from './schedule-polling'

type Tick = () => void | Promise<void>

function fakeTimers() {
  let tick: Tick | null = null
  let intervalMs: number | null = null
  const cleared: unknown[] = []
  const handle = 17 as unknown as ReturnType<typeof setInterval>
  const timers: PollingTimers = {
    setInterval(callback, milliseconds) {
      tick = callback
      intervalMs = milliseconds
      return handle
    },
    clearInterval(value) {
      cleared.push(value)
    },
  }
  return {
    timers,
    getTick: () => {
      if (!tick) throw new Error('poller did not register a timer')
      return tick
    },
    getIntervalMs: () => intervalMs,
    cleared,
    handle,
  }
}

describe('startSchedulePolling', () => {
  it('applies successful snapshots every ten seconds by default', async () => {
    const timer = fakeTimers()
    const snapshots: string[][] = []
    startSchedulePolling({
      load: async () => ({ success: true, data: ['fresh'] }),
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      timers: timer.timers,
    })

    await timer.getTick()()

    expect(timer.getIntervalMs()).toBe(10_000)
    expect(snapshots).toEqual([['fresh']])
  })

  it('preserves the last snapshot when refresh returns a failure', async () => {
    const timer = fakeTimers()
    const snapshots: string[][] = []
    startSchedulePolling<string[]>({
      load: async () => ({ success: false, error: 'temporary failure' }),
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      timers: timer.timers,
    })

    await timer.getTick()()

    expect(snapshots).toEqual([])
  })

  it('ignores a response that arrives after disposal', async () => {
    const timer = fakeTimers()
    const snapshots: string[][] = []
    let resolveLoad: ((result: { success: true; data: string[] }) => void) | null = null
    const load = new Promise<{ success: true; data: string[] }>((resolve) => {
      resolveLoad = resolve
    })
    const dispose = startSchedulePolling({
      load: () => load,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      timers: timer.timers,
    })

    const pendingTick = timer.getTick()()
    dispose()
    resolveLoad?.({ success: true, data: ['late'] })
    await pendingTick

    expect(snapshots).toEqual([])
  })

  it('ignores a response that started before a schedule mutation', async () => {
    const timer = fakeTimers()
    const snapshots: string[][] = []
    let mutationVersion = 0
    let resolveLoad: ((result: { success: true; data: string[] }) => void) | null = null
    const load = new Promise<{ success: true; data: string[] }>((resolve) => {
      resolveLoad = resolve
    })
    startSchedulePolling({
      load: () => load,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      getMutationVersion: () => mutationVersion,
      timers: timer.timers,
    })

    const pendingTick = timer.getTick()()
    mutationVersion += 1
    resolveLoad?.({ success: true, data: ['stale'] })
    await pendingTick

    expect(snapshots).toEqual([])
  })

  it('does not start a refresh while a schedule mutation is in flight', async () => {
    const timer = fakeTimers()
    const snapshots: string[][] = []
    let mutationPending = true
    let loadCalls = 0
    startSchedulePolling({
      load: async () => {
        loadCalls += 1
        return { success: true, data: ['fresh'] }
      },
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      isMutationPending: () => mutationPending,
      timers: timer.timers,
    })

    await timer.getTick()()
    expect(loadCalls).toBe(0)
    expect(snapshots).toEqual([])

    mutationPending = false
    await timer.getTick()()
    expect(loadCalls).toBe(1)
    expect(snapshots).toEqual([['fresh']])
  })

  it('clears its timer when disposed', () => {
    const timer = fakeTimers()
    const dispose = startSchedulePolling({
      load: async () => ({ success: true, data: ['fresh'] }),
      onSnapshot: () => undefined,
      timers: timer.timers,
    })

    dispose()

    expect(timer.cleared).toEqual([timer.handle])
  })
})
