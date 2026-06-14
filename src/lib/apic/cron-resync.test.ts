import { describe, expect, it } from 'bun:test'
import { isAuthorized, summarizeResults, type HostResult } from './cron-resync'

describe('isAuthorized', () => {
  const token = 'sekret-token-value'

  it('accepts a matching Bearer token', () => {
    expect(isAuthorized(`Bearer ${token}`, token)).toBe(true)
  })

  it('rejects a wrong token', () => {
    expect(isAuthorized('Bearer wrong', token)).toBe(false)
  })

  it('rejects a null header', () => {
    expect(isAuthorized(null, token)).toBe(false)
  })

  it('rejects a header without the Bearer prefix', () => {
    expect(isAuthorized(token, token)).toBe(false)
  })

  it('rejects a token of a different length without throwing', () => {
    expect(isAuthorized('Bearer short', token)).toBe(false)
  })
})

describe('summarizeResults', () => {
  const ok = { synced: 1, total: 1 }
  const bad = { error: 'boom' }

  it('returns failure for an empty result set', () => {
    expect(summarizeResults([])).toBe('failure')
  })

  it('returns success when every dataset succeeded', () => {
    const results: HostResult[] = [
      { apicHostId: 'a', host: 'a', endpoints: ok, interfaces: ok },
    ]
    expect(summarizeResults(results)).toBe('success')
  })

  it('returns failure when every dataset failed', () => {
    const results: HostResult[] = [
      { apicHostId: 'a', host: 'a', endpoints: bad, interfaces: bad },
    ]
    expect(summarizeResults(results)).toBe('failure')
  })

  it('returns partial when some datasets failed', () => {
    const results: HostResult[] = [
      { apicHostId: 'a', host: 'a', endpoints: ok, interfaces: bad },
    ]
    expect(summarizeResults(results)).toBe('partial')
  })

  it('counts a host-level error as a failed unit', () => {
    const results: HostResult[] = [
      { apicHostId: 'a', host: 'a', endpoints: ok, interfaces: ok },
      { apicHostId: 'b', host: null, error: 'Host not found' },
    ]
    expect(summarizeResults(results)).toBe('partial')
  })
})

describe('summarizeResults with faults dataset', () => {
  it('counts the faults dataset as a unit', () => {
    const results: HostResult[] = [
      {
        apicHostId: 'h1',
        host: 'apic1',
        endpoints: { synced: 1, total: 1 },
        interfaces: { synced: 2, total: 2 },
        faults: { error: 'boom' },
      },
    ]
    expect(summarizeResults(results)).toBe('partial')
  })
})

describe('summarizeResults with health dataset', () => {
  it('counts the health dataset as a unit', () => {
    const results: HostResult[] = [
      {
        apicHostId: 'h1',
        host: 'apic1',
        endpoints: { synced: 1, total: 1 },
        interfaces: { synced: 2, total: 2 },
        faults: { synced: 3, total: 3 },
        healthScores: { error: 'boom' },
      },
    ]
    expect(summarizeResults(results)).toBe('partial')
  })
})
