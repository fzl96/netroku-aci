import { describe, expect, it } from 'bun:test'
import { serializeLegacyCounter, serializeLegacyDate } from './serialize'

describe('legacy client serialization', () => {
  it('preserves exact BigInt counters', () => {
    expect(serializeLegacyCounter(9007199254740993n)).toBe('9007199254740993')
    expect(serializeLegacyCounter(0n)).toBe('0')
    expect(serializeLegacyCounter(null)).toBeNull()
  })

  it('serializes nullable dates as ISO strings', () => {
    expect(serializeLegacyDate(new Date('2026-07-21T12:00:00Z'))).toBe('2026-07-21T12:00:00.000Z')
    expect(serializeLegacyDate(null)).toBeNull()
  })
})
