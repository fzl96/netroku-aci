import { describe, expect, it } from 'bun:test'
import {
  explicitScopeForPath,
  resolveNavigationScope,
  targetPathForScope,
} from './navigation-scope'

describe('explicitScopeForPath', () => {
  it('pins legacy and ACI routes and leaves shared routes unpinned', () => {
    expect(explicitScopeForPath('/legacy/devices')).toBe('legacy')
    expect(explicitScopeForPath('/nodes')).toBe('aci')
    expect(explicitScopeForPath('/scheduler')).toBe('aci')
    expect(explicitScopeForPath('/dashboard')).toBeNull()
    expect(explicitScopeForPath('/inventory')).toBeNull()
    expect(explicitScopeForPath('/inventory/devices/abc')).toBeNull()
  })
})

describe('resolveNavigationScope', () => {
  it('keeps the reader scope on inventory routes', () => {
    expect(resolveNavigationScope('/inventory/devices', 'legacy')).toBe('legacy')
    expect(resolveNavigationScope('/inventory/racks', 'aci')).toBe('aci')
    expect(resolveNavigationScope('/inventory-internal', 'legacy')).toBe('aci')
  })

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
    expect(targetPathForScope('/inventory/devices', 'legacy')).toBe('/inventory/devices')
    expect(targetPathForScope('/legacy/health', 'aci')).toBe('/apic-hosts')
    expect(targetPathForScope('/epgs', 'legacy')).toBe('/legacy/devices')
  })

  it('keeps the current path when selecting its existing scope', () => {
    expect(targetPathForScope('/legacy/interfaces/details', 'legacy')).toBe(
      '/legacy/interfaces/details',
    )
    expect(targetPathForScope('/nodes', 'aci')).toBe('/nodes')
  })
})
