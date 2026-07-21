import { describe, expect, it } from 'bun:test'
import {
  resolveNavigationScope,
  targetPathForScope,
} from './navigation-scope'

describe('resolveNavigationScope', () => {
  it('uses exact legacy path segments instead of prefix lookalikes', () => {
    expect(resolveNavigationScope('/legacy/interfaces', 'aci')).toBe('legacy')
    expect(resolveNavigationScope('/legacy', 'aci')).toBe('legacy')
    expect(resolveNavigationScope('/legacy-internal')).toBe('aci')
  })

  it('forces ACI on existing ACI infrastructure and workflow routes', () => {
    expect(resolveNavigationScope('/nodes', 'legacy')).toBe('aci')
    expect(resolveNavigationScope('/bridge-domains/l2/deploy', 'legacy')).toBe('aci')
  })

  it('uses the cookie on shared routes and otherwise defaults to ACI', () => {
    expect(resolveNavigationScope('/dashboard', 'legacy')).toBe('legacy')
    expect(resolveNavigationScope('/settings', 'aci')).toBe('aci')
    expect(resolveNavigationScope('/docs')).toBe('aci')
  })
})

describe('targetPathForScope', () => {
  it('cross-navigates matching infrastructure pages', () => {
    expect(targetPathForScope('/endpoints', 'legacy')).toBe('/legacy/endpoints')
    expect(targetPathForScope('/interface-health', 'legacy')).toBe('/legacy/interfaces')
    expect(targetPathForScope('/nodes', 'legacy')).toBe('/legacy/devices')
    expect(targetPathForScope('/apic-hosts', 'legacy')).toBe('/legacy/devices')
    expect(targetPathForScope('/legacy/endpoints', 'aci')).toBe('/endpoints')
    expect(targetPathForScope('/legacy/interfaces', 'aci')).toBe('/interface-health')
    expect(targetPathForScope('/legacy/devices', 'aci')).toBe('/apic-hosts')
  })

  it('keeps shared routes and applies documented fallbacks', () => {
    expect(targetPathForScope('/settings', 'legacy')).toBe('/settings')
    expect(targetPathForScope('/legacy/health', 'aci')).toBe('/apic-hosts')
    expect(targetPathForScope('/epgs', 'legacy')).toBe('/legacy/devices')
  })

  it('keeps the current path when selecting its existing scope', () => {
    expect(targetPathForScope('/legacy/interfaces/details', 'legacy')).toBe('/legacy/interfaces/details')
    expect(targetPathForScope('/nodes', 'aci')).toBe('/nodes')
  })
})
