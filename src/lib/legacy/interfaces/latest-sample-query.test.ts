import { describe, expect, test } from 'bun:test'
import { buildLegacyLatestSampleQuery, queryLegacyLatestSamples } from './latest-sample-query'

const row = {
  interfaceId: 'if-1',
  collectedAt: new Date('2026-08-01T00:00:00.000Z'),
  inputErrors: BigInt(10),
  outputErrors: BigInt(2),
  crcErrors: BigInt(7),
  dInputErrors: BigInt(1),
  dOutputErrors: null,
  dCrcErrors: BigInt(4),
}

describe('legacy interface latest sample query', () => {
  test('seeks one sample per interface instead of ranking the sample table', () => {
    const query = buildLegacyLatestSampleQuery(['if-1', 'if-2'])
    const text = query.strings.join('?')

    expect(text).toContain('JOIN LATERAL')
    expect(text).toContain('ORDER BY sample."collectedAt" DESC')
    expect(text).toContain('LIMIT 1')
    // A window function here would read every sample row for every interface.
    expect(text).not.toContain('OVER')
    expect(query.values).toEqual([['if-1', 'if-2']])
  })

  test('keys the samples by interface so rows can be zipped without a scan', async () => {
    const samples = await queryLegacyLatestSamples(async () => [row], ['if-1', 'if-2'])

    expect(samples.get('if-1')).toEqual(row)
    // Never sampled, so no entry — the row renders with blank counters.
    expect(samples.get('if-2')).toBeUndefined()
  })

  test('skips the round trip when nothing matched the filters', async () => {
    let called = false
    const samples = await queryLegacyLatestSamples(async () => {
      called = true
      return []
    }, [])

    expect(samples.size).toBe(0)
    expect(called).toBe(false)
  })
})
