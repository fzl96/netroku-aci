import { describe, expect, it } from 'bun:test'
import { refreshResyncSchedules } from './polling-client'
import { serializeSchedulePollingSnapshot } from './polling-wire'

it('serializes scheduler dates for the polling wire format', () => {
  expect(serializeSchedulePollingSnapshot([{
    apicHostId: 'host-1',
    hostName: 'APIC 1',
    host: '10.0.0.1',
    enabled: true,
    intervalMinutes: 480,
    username: 'admin',
    hasPassword: true,
    lastRunAt: new Date('2026-09-03T01:00:00.000Z'),
    lastStatus: 'success',
    lastDetail: null,
    nextRunAt: new Date('2026-09-03T09:00:00.000Z'),
    isRunning: false,
    isOverdue: false,
  }])).toEqual([expect.objectContaining({
    lastRunAt: '2026-09-03T01:00:00.000Z',
    nextRunAt: '2026-09-03T09:00:00.000Z',
  })])
})

describe('refreshResyncSchedules', () => {
  it('loads a no-store scheduler snapshot and restores Date values', async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = []
    const fetcher = async (input: string, init?: RequestInit) => {
      calls.push({ input, init })
      return Response.json({
        data: [{
          apicHostId: 'host-1',
          hostName: 'APIC 1',
          host: '10.0.0.1',
          enabled: true,
          intervalMinutes: 480,
          username: 'admin',
          hasPassword: true,
          lastRunAt: '2026-09-03T01:00:00.000Z',
          lastStatus: 'success',
          lastDetail: null,
          nextRunAt: '2026-09-03T09:00:00.000Z',
          isRunning: false,
          isOverdue: false,
        }],
      })
    }

    const result = await refreshResyncSchedules(fetcher)

    expect(calls).toEqual([{
      input: '/api/scheduler',
      init: { cache: 'no-store' },
    }])
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected a successful scheduler snapshot')
    expect(result.data[0]?.lastRunAt).toEqual(new Date('2026-09-03T01:00:00.000Z'))
    expect(result.data[0]?.nextRunAt).toEqual(new Date('2026-09-03T09:00:00.000Z'))
  })

  it('keeps the last snapshot when the polling endpoint fails', async () => {
    const fetcher = async () => Response.json(
      { error: 'Unable to load resync schedules' },
      { status: 503 },
    )

    expect(await refreshResyncSchedules(fetcher)).toEqual({
      success: false,
      error: 'Unable to load resync schedules',
    })
  })
})
