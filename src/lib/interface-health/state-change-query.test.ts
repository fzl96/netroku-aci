import { describe, expect, it } from 'bun:test'
import {
  buildStateChangedInterfaceIdsQuery,
  queryStateChangedInterfaceIds,
} from './state-change-query'

describe('state change SQL query', () => {
  it('includes a pre-window baseline and window comparison', () => {
    const windowStart = new Date('2026-07-10T00:00:00Z')
    const query = buildStateChangedInterfaceIdsQuery('host-1', windowStart)
    const text = query.strings.join('?')

    expect(text).toContain('JOIN LATERAL')
    expect(text).toContain('LAG(')
    expect(text).toContain('"previousSampledAt"')
    expect(query.values).toContain('host-1')
    expect(query.values).toContain(windowStart)
  })

  it('returns only IDs from the executor rows', async () => {
    const ids = await queryStateChangedInterfaceIds(
      async () => [{ interfaceId: 'if-1' }, { interfaceId: 'if-2' }],
      'host-1',
      new Date('2026-07-10T00:00:00Z'),
    )

    expect(ids).toEqual(['if-1', 'if-2'])
  })
})
