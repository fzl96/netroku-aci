import { describe, expect, test } from 'bun:test'
import { blocker, groupFor, initialDraft, selectionConflict, rowKey, type Row } from './batch-model'
import type { DiscoveryData } from '@/lib/inventory/sources/query'

const row = {
  id: 'node-1',
  kind: 'ACI',
  reviewToken: 'review',
  name: 'leaf-101',
  serial: 'ABC123',
  model: 'N9K',
  vendor: 'Cisco',
  version: '1.0',
  present: true,
  conflict: null,
  link: null,
  reserved: false,
  pending: false,
  matchCount: 0,
  matchId: null,
  seenAt: '2026-09-10T00:00:00.000Z',
  sourceLabel: 'leaf-101',
} as Row
const asset: DiscoveryData['devices'][number] = {
  id: 'asset-1',
  name: 'old-name',
  serialNumber: 'abc123',
  model: 'N9K',
  version: null,
  deviceStackId: null,
  source: null,
}

describe('discovery batch readiness', () => {
  test('proposes an exact normalized match and preserves the target identity', () => {
    const matched = { ...row, matchCount: 1, matchId: asset.id }
    expect(groupFor(matched, [asset])).toBe('Ready to link')
    expect(initialDraft(matched).targetId).toBe(asset.id)
    expect(blocker(matched, initialDraft(matched), [asset], [])).toBeNull()
  })
  test('occupied and ambiguous matches require attention', () => {
    const occupied = { ...asset, source: { id: 'source-1', sourceLabel: 'other' } }
    const matched = { ...row, matchCount: 1, matchId: asset.id }
    expect(groupFor(matched, [occupied])).toBe('Needs attention')
    expect(blocker(matched, initialDraft(matched), [occupied], [])).toBe(
      'Target already has a source',
    )
    expect(groupFor({ ...row, matchCount: 2 }, [asset])).toBe('Needs attention')
  })
  test('new devices require explicit, valid rack height', () => {
    const draft = initialDraft(row)
    expect(groupFor(row, [])).toBe('New devices')
    for (const height of ['', '0', '1.5', '61', 'NaN']) {
      expect(blocker(row, { ...draft, height }, [], [])).toBe('Set height between 1 and 60U')
    }
    expect(blocker(row, { ...draft, height: '2' }, [], [])).toBeNull()
  })
  test('missing serials can be completed manually, while source conflicts cannot be bypassed', () => {
    const missing = { ...row, serial: null }
    expect(groupFor(missing, [])).toBe('Needs attention')
    expect(
      blocker(missing, { ...initialDraft(missing), serialNumber: 'XYZ', height: '1' }, [], []),
    ).toBeNull()
    expect(
      blocker(
        { ...row, conflict: 'Conflicting observations' },
        { ...initialDraft(row), height: '1' },
        [],
        [],
      ),
    ).toBe('Conflicting observations')
  })
  test('disconnected reservations require explicit relinking', () => {
    const reserved = {
      ...row,
      reserved: true,
      link: { id: 'source', deviceId: asset.id, stackId: null, conflict: null },
    }
    expect(groupFor(reserved, [asset])).toBe('Needs attention')
    expect(blocker(reserved, initialDraft(reserved), [asset], [])).toContain('Already linked')
    expect(
      blocker(
        reserved,
        { ...initialDraft(reserved), mode: 'LINK', targetId: asset.id, relink: true },
        [asset],
        [],
      ),
    ).toBeNull()
  })
  test('rejects identity mismatches even when manually selecting a target', () => {
    expect(
      blocker(
        row,
        { ...initialDraft(row), mode: 'LINK', targetId: asset.id },
        [{ ...asset, serialNumber: 'different' }],
        [],
      ),
    ).toBe('Physical serials do not match')
  })
  test('stack proposals require Legacy and physical members', () => {
    const draft = { ...initialDraft(row), mode: 'STACK' as const }
    expect(blocker(row, draft, [], [])).toBe('Only Legacy records can represent a stack')
    expect(blocker({ ...row, kind: 'LEGACY' }, draft, [], [])).toContain('physical members')
    expect(
      blocker({ ...row, kind: 'LEGACY' }, { ...draft, memberIds: [asset.id] }, [asset], []),
    ).toBeNull()
  })
  test('separates selection keys for ACI and Legacy records with the same ID', () => {
    expect(rowKey(row)).not.toBe(rowKey({ ...row, kind: 'LEGACY' }))
  })
})

test('blocks duplicate targets across sources and overlapping stack members', () => {
  const legacy = { ...row, kind: 'LEGACY' as const }
  const physicalDraft = { ...initialDraft(row), mode: 'LINK' as const, targetId: asset.id }
  expect(selectionConflict(row, () => physicalDraft, [row, legacy])).not.toBeNull()
  expect(selectionConflict(row, () => physicalDraft, [row])).toBeNull()
  const stackDraft = { ...initialDraft(row), mode: 'STACK' as const, memberIds: [asset.id] }
  expect(selectionConflict(row, () => stackDraft, [row, legacy])).not.toBeNull()
})
