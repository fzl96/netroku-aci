import { describe, expect, it } from 'bun:test'
import { serializeStatusSamples } from '@/app/(app)/interface-health/state-changes'

describe('serializeStatusSamples', () => {
  it('correctly flags state transitions between consecutive samples', () => {
    const t1 = new Date('2026-07-01T10:00:00Z')
    const t2 = new Date('2026-07-01T10:05:00Z')
    const t3 = new Date('2026-07-01T10:10:00Z')

    const rawSamples = [
      { id: 's1', sampledAt: t1, adminSt: 'up', operSt: 'up', operSpeed: '10G' },
      { id: 's2', sampledAt: t2, adminSt: 'up', operSt: 'down', operSpeed: 'unknown' }, // state change
      { id: 's3', sampledAt: t3, adminSt: 'up', operSt: 'down', operSpeed: 'unknown' }, // no change
    ]

    const result = serializeStatusSamples(rawSamples)

    expect(result).toHaveLength(3)
    expect(result[0].isStateChange).toBe(false)
    expect(result[1].isStateChange).toBe(true)
    expect(result[2].isStateChange).toBe(false)
  })
})
