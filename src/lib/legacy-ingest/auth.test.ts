import { describe, expect, it } from 'bun:test'
import { isLegacyIngestAuthorized } from './auth'

describe('isLegacyIngestAuthorized', () => {
  const token = 'expected-token'

  it('accepts an exact bearer token', () => {
    expect(isLegacyIngestAuthorized(`Bearer ${token}`, token)).toBe(true)
  })

  it('rejects missing, malformed, wrong, and unequal-length tokens', () => {
    expect(isLegacyIngestAuthorized(null, token)).toBe(false)
    expect(isLegacyIngestAuthorized(token, token)).toBe(false)
    expect(isLegacyIngestAuthorized('Bearer wrong-tokenxx', token)).toBe(false)
    expect(isLegacyIngestAuthorized('Bearer short', token)).toBe(false)
  })
})
