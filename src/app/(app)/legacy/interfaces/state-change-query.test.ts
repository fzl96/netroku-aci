import { describe, expect, test } from 'bun:test'
import {
  buildLegacyStateChangedInterfaceIdsQuery,
  queryLegacyStateChangedInterfaceIds,
} from './state-change-query'

describe('legacy interface state change query', () => {
  test('includes present interfaces, a pre-window baseline, and both state comparisons', () => {
    const cutoff = new Date('2026-08-01T00:00:00.000Z')
    const query = buildLegacyStateChangedInterfaceIdsQuery(cutoff)
    const text = query.strings.join('?')

    expect(text).toContain('legacy_interface_snapshot')
    expect(text).toContain('legacy_interface_sample')
    expect(text).toContain('present = TRUE')
    expect(text).toContain('JOIN LATERAL')
    expect(text).toContain('LAG(')
    expect(text).toContain('"previousAdminSt" IS DISTINCT FROM "adminSt"')
    expect(text).toContain('"previousOperSt" IS DISTINCT FROM "operSt"')
    expect(query.values).toContain(cutoff)
  })

  test('returns only IDs produced by the query executor', async () => {
    const cutoff = new Date('2026-08-01T00:00:00.000Z')
    const ids = await queryLegacyStateChangedInterfaceIds(
      async () => [{ interfaceId: 'if-1' }, { interfaceId: 'if-2' }],
      cutoff,
    )

    expect(ids).toEqual(['if-1', 'if-2'])
  })
})
