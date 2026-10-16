import { describe, expect, it } from 'bun:test'
import { deviceSourceKind } from './source'

describe('deviceSourceKind', () => {
  it('uses the stored source kind even when the discovery record is disconnected', () => {
    expect(deviceSourceKind({ source: { kind: 'ACI' } })).toBe('ACI')
    expect(deviceSourceKind({ source: { kind: 'LEGACY' } })).toBe('LEGACY')
  })

  it('uses a stack source for members without their own link', () => {
    expect(deviceSourceKind({ source: null, deviceStack: { source: { kind: 'LEGACY' } } })).toBe(
      'LEGACY',
    )
  })

  it('prefers the physical device source over the stack source', () => {
    expect(
      deviceSourceKind({ source: { kind: 'ACI' }, deviceStack: { source: { kind: 'LEGACY' } } }),
    ).toBe('ACI')
  })

  it('keeps unlinked devices and members of unlinked stacks unclassified', () => {
    expect(deviceSourceKind({})).toBe('UNLINKED')
    expect(deviceSourceKind({ source: null, deviceStack: null })).toBe('UNLINKED')
    expect(deviceSourceKind({ source: null, deviceStack: { source: null } })).toBe('UNLINKED')
  })
})
