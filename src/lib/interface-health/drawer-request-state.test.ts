import { describe, expect, it } from 'bun:test'
import { makeDrawerRequestKey, resolveDrawerRequest } from './drawer-request-state'

describe('drawer request state', () => {
  it('shows an error only for the request key that failed', () => {
    const failed = {
      key: 'errors:if-1:7d',
      data: null,
      failed: true,
    }

    expect(resolveDrawerRequest('errors:if-1:7d', failed)).toEqual({
      loading: false,
      failed: true,
      data: null,
    })
    expect(resolveDrawerRequest('errors:if-1:30d', failed)).toEqual({
      loading: true,
      failed: false,
      data: null,
    })
  })

  it('returns successful data only for the matching request', () => {
    const success = {
      key: 'status:if-1:7d',
      data: { operSt: 'up' },
      failed: false,
    }

    expect(resolveDrawerRequest('status:if-1:7d', success)).toEqual({
      loading: false,
      failed: false,
      data: { operSt: 'up' },
    })
    expect(resolveDrawerRequest(null, success)).toEqual({
      loading: false,
      failed: false,
      data: null,
    })
  })

  it('includes mode, interface, and range in the key', () => {
    expect(makeDrawerRequestKey('status', 'if-1', '30d')).toBe('status:if-1:30d')
  })
})
