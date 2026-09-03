import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test'
import { isAuthorized, summarizeResults, type HostResult } from './cron-resync'

const resyncEndpointInventoryForScheduler = mock(async (input: unknown) => {
  void input
  return { synced: 3, total: 7 }
})
const resyncInterfaceInventoryForScheduler = mock(async (input: unknown) => {
  void input
  return { synced: 2, total: 2 }
})
const resyncNodeInventoryForScheduler = mock(async (input: unknown) => {
  void input
  return { syncedNodes: 1, syncedComponents: 4, nodesOnline: 1 }
})
const resyncEpgInventoryForScheduler = mock(async (input: unknown) => {
  void input
  return { syncedEpgs: 2, syncedBindings: 6 }
})

mock.module('server-only', () => ({}))

const { resyncHost } = await import('./resync-host')

const dependencies = {
  resyncEndpointInventoryForScheduler,
  resyncInterfaceInventoryForScheduler,
  resyncNodeInventoryForScheduler,
  resyncEpgInventoryForScheduler,
}

beforeEach(() => {
  resyncEndpointInventoryForScheduler.mockClear()
  resyncEndpointInventoryForScheduler.mockImplementation(async (input: unknown) => {
    void input
    return { synced: 3, total: 7 }
  })
  resyncInterfaceInventoryForScheduler.mockClear()
  resyncInterfaceInventoryForScheduler.mockImplementation(async (input: unknown) => {
    void input
    return { synced: 2, total: 2 }
  })
  resyncNodeInventoryForScheduler.mockClear()
  resyncNodeInventoryForScheduler.mockImplementation(async (input: unknown) => {
    void input
    return { syncedNodes: 1, syncedComponents: 4, nodesOnline: 1 }
  })
  resyncEpgInventoryForScheduler.mockClear()
  resyncEpgInventoryForScheduler.mockImplementation(async (input: unknown) => {
    void input
    return { syncedEpgs: 2, syncedBindings: 6 }
  })
})

afterAll(() => mock.restore())

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

describe('summarizeResults with nodes dataset', () => {
  it('counts the nodes dataset as a unit', () => {
    const results: HostResult[] = [
      {
        apicHostId: 'h1',
        host: 'apic1',
        endpoints: { synced: 1, total: 1 },
        interfaces: { synced: 2, total: 2 },
        nodes: { error: 'boom' },
      },
    ]
    expect(summarizeResults(results)).toBe('partial')
  })
})

describe('summarizeResults epgs dataset', () => {
  it('counts a failed epgs dataset toward partial status', () => {
    const status = summarizeResults([
      {
        apicHostId: 'h1',
        host: 'apic1',
        endpoints: { synced: 1, total: 1 },
        epgs: { error: 'boom' },
      },
    ])
    expect(status).toBe('partial')
  })
})

describe('resyncHost endpoint purpose boundary', () => {
  const input = {
    apicHostId: 'host-1',
    hostName: 'APIC One',
    host: '192.0.2.1',
    username: 'scheduler-user',
    password: 'secret',
  }

  it('enters endpoints through the trusted purpose mutation exactly once', async () => {
    await expect(resyncHost(input, dependencies)).resolves.toEqual({
      apicHostId: 'host-1',
      host: 'APIC One',
      endpoints: { synced: 3, total: 7 },
      interfaces: { synced: 2, total: 2 },
      nodes: { synced: 1, total: 5 },
      epgs: { synced: 2, total: 8 },
    })

    expect(resyncEndpointInventoryForScheduler).toHaveBeenCalledTimes(1)
    expect(resyncEndpointInventoryForScheduler).toHaveBeenCalledWith(input)
  })

  it('captures endpoint failures and continues later datasets', async () => {
    resyncEndpointInventoryForScheduler.mockImplementation(async (input: unknown) => {
      void input
      throw new Error('endpoint APIC unavailable')
    })

    const result = await resyncHost(input, dependencies)

    expect(result.endpoints).toEqual({ error: 'endpoint APIC unavailable' })
    expect(resyncInterfaceInventoryForScheduler).toHaveBeenCalledTimes(1)
    expect(resyncNodeInventoryForScheduler).toHaveBeenCalledTimes(1)
    expect(resyncEpgInventoryForScheduler).toHaveBeenCalledTimes(1)
  })

  it('enters EPGs through the trusted purpose mutation without a duplicate runner-level audit', async () => {
    await resyncHost(input, dependencies)

    expect(resyncEpgInventoryForScheduler).toHaveBeenCalledTimes(1)
    expect(resyncEpgInventoryForScheduler).toHaveBeenCalledWith(input)
  })

  it('enters interfaces through the trusted purpose mutation without a duplicate runner-level audit', async () => {
    await resyncHost(input, dependencies)

    expect(resyncInterfaceInventoryForScheduler).toHaveBeenCalledTimes(1)
    expect(resyncInterfaceInventoryForScheduler).toHaveBeenCalledWith(input)
  })

  it('enters nodes through the trusted purpose mutation without a duplicate runner-level audit', async () => {
    await resyncHost(input, dependencies)

    expect(resyncNodeInventoryForScheduler).toHaveBeenCalledTimes(1)
    expect(resyncNodeInventoryForScheduler).toHaveBeenCalledWith(input)
  })
})
