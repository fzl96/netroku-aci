import { afterAll, describe, expect, it, mock } from 'bun:test'

const completedAt = new Date('2026-08-17T13:00:00.000Z')
let persistedData: Record<string, unknown> | null = null
let currentIntervalMinutes = 240
let currentEnabled = true
let transactionCalls = 0

const tx = {
  $queryRaw: mock(async () => currentIntervalMinutes === 0
    ? []
    : [{ enabled: currentEnabled, intervalMinutes: currentIntervalMinutes }]),
  resyncSchedule: {
    update: mock(async ({ data }: { data: Record<string, unknown> }) => {
      persistedData = data
      return { id: 'schedule-1', ...data }
    }),
  },
}

const prisma = {
  $transaction: mock(async <T>(operation: (client: typeof tx) => Promise<T>) => {
    transactionCalls += 1
    return operation(tx)
  }),
  $queryRaw: mock(async () => []),
  resyncSchedule: {
    update: mock(async ({ data }: { data: Record<string, unknown> }) => {
      persistedData = data
      return { id: 'schedule-1', ...data }
    }),
  },
}

mock.module('@/lib/prisma', () => ({ prisma }))

const { finalizeSchedule } = await import('./schedule-claim')

afterAll(() => mock.restore())

describe('finalizeSchedule', () => {
  it('uses the latest locked interval instead of the interval captured by the claim', async () => {
    persistedData = null
    currentIntervalMinutes = 240
    currentEnabled = true
    transactionCalls = 0

    await finalizeSchedule({
      id: 'schedule-1',
      status: 'success',
      detail: 'completed',
      completedAt,
    })

    expect(transactionCalls).toBe(1)
    expect(persistedData).toEqual({
      lastRunAt: completedAt,
      lastStatus: 'success',
      lastDetail: 'completed',
      nextRunAt: new Date('2026-08-17T17:00:00.000Z'),
      runningAt: null,
    })
  })

  it('keeps Next Run cleared when the schedule was disabled during the run', async () => {
    persistedData = null
    currentIntervalMinutes = 240
    currentEnabled = false

    await finalizeSchedule({
      id: 'schedule-1',
      status: 'success',
      detail: 'completed while disabled',
      completedAt,
    })

    expect(persistedData).toEqual(expect.objectContaining({
      lastRunAt: completedAt,
      nextRunAt: null,
      runningAt: null,
    }))
  })
})
