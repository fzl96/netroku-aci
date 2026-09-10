import { describe, expect, test } from 'bun:test'
import { serialKey, sourceKey, assertOwnedFields, technicalPatch } from './identity'
import { orderedMetadata } from './outbox'
describe('inventory identity and metadata ownership', () => {
  test('normalizes serials without collapsing punctuation, excludes placeholders', () => {
    expect(serialKey(' ABC-1 ')).toBe('abc-1')
    expect(serialKey('N/A')).toBeNull()
    expect(serialKey('ABC1')).not.toBe(serialKey('ABC-1'))
    expect(sourceKey('a:b', 'c')).not.toBe(sourceKey('a', 'b:c'))
  })
  test('protects disconnected links and permits identical owned values', () => {
    const existing = {
      name: 'leaf',
      serialNumber: 'SN1',
      model: 'N9K',
      version: 'v1',
      source: { nodeSnapshotId: null },
    }
    expect(() => assertOwnedFields(existing, { name: 'leaf' })).not.toThrow()
    expect(() => assertOwnedFields(existing, { version: 'v2' })).toThrow('maintained by discovery')
    expect(() => assertOwnedFields({ ...existing, source: null }, { version: 'v2' })).not.toThrow()
    expect(
      technicalPatch(existing, {
        name: '',
        serial: null,
        model: null,
        version: null,
        sourceLabel: '',
        seenAt: new Date().toISOString(),
        managementIp: null,
        present: true,
        conflict: null,
      }),
    ).toEqual({})
  })
  test('orders metadata per field, detects equal-time conflict, and clears only on newer data', () => {
    const initial = orderedMetadata({}, { model: 'C9300' }, {}, '2026-09-09T02:00:00.000Z')
    const partial = orderedMetadata(
      { model: 'C9300' },
      { model: 'old', softwareVersion: 'v1' },
      initial.clock,
      '2026-09-09T01:00:00.000Z',
    )
    expect(partial.data).toEqual({ softwareVersion: 'v1' })
    const conflict = orderedMetadata(
      { model: 'C9300' },
      { model: 'different' },
      partial.clock,
      '2026-09-09T02:00:00.000Z',
    )
    expect(conflict.conflict).toContain('model')
    expect(conflict.data).toEqual({})
    const recovery = orderedMetadata(
      { model: 'C9300' },
      { model: 'different' },
      conflict.clock,
      '2026-09-09T03:00:00.000Z',
    )
    expect(recovery.conflict).toBeNull()
  })
})
