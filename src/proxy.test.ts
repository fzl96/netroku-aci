import { describe, expect, it } from 'bun:test'
import { shouldRedirectUnauthenticated } from './proxy'

describe('shouldRedirectUnauthenticated', () => {
  it('keeps the root page public', () => {
    expect(shouldRedirectUnauthenticated(null, '/')).toBe(false)
  })

  it('still redirects signed-out users from protected pages', () => {
    expect(shouldRedirectUnauthenticated(null, '/apic-hosts')).toBe(true)
  })
})
