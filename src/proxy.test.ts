import { describe, expect, it } from 'bun:test'
import { shouldRedirectUnauthenticated } from './proxy'

describe('shouldRedirectUnauthenticated', () => {
  it('keeps the root page public', () => {
    expect(shouldRedirectUnauthenticated(null, '/')).toBe(false)
  })

  it('still redirects signed-out users from protected pages', () => {
    expect(shouldRedirectUnauthenticated(null, '/apic-hosts')).toBe(true)
  })

  it('treats signup as protected because admins create users', () => {
    expect(shouldRedirectUnauthenticated(null, '/signup')).toBe(true)
  })

  it('keeps /docs public', () => {
    expect(shouldRedirectUnauthenticated(null, '/docs')).toBe(false)
  })

  it('keeps /docs sub-pages public', () => {
    expect(shouldRedirectUnauthenticated(null, '/docs/user-guide/dashboard')).toBe(false)
  })

  it('does not treat /docs-prefixed routes as public', () => {
    expect(shouldRedirectUnauthenticated(null, '/docs-internal')).toBe(true)
  })

  it('lets legacy ingestion routes enforce their bearer token', () => {
    expect(shouldRedirectUnauthenticated(null, '/api/ingest/legacy/health')).toBe(false)
    expect(shouldRedirectUnauthenticated(null, '/api/ingest/legacy/interfaces')).toBe(false)
    expect(shouldRedirectUnauthenticated(null, '/api/ingest/legacy/endpoints')).toBe(false)
    expect(shouldRedirectUnauthenticated(null, '/api/ingest/legacy-internal')).toBe(true)
  })
})
