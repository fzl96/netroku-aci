import { describe, expect, it } from 'bun:test'
import {
  EndpointResyncInProgressError,
  executeEndpointResyncPlan,
  reconcileFetchedEndpoints,
} from './endpoints'
import type { EndpointResyncWriteClient, EndpointTransactionClient } from './endpoints'
import type { EndpointResyncPlan } from './endpoint-resync'

function plan(overrides: Partial<EndpointResyncPlan> = {}): EndpointResyncPlan {
  return {
    bumps: ['bump-1'],
    clears: ['clear-1'],
    relabels: [{ id: 'relabel-1', epgDescr: 'New Label' }],
    inserts: [{
      mac: 'aa:bb:cc:dd:ee:ff',
      ip: '10.0.0.1',
      vlan: 'vlan-100',
      dn: 'uni/tn-t/ap-a/epg-web/cep-aa:bb:cc:dd:ee:ff',
      node: '101',
      interface: 'eth1/1',
      epgDescr: 'Web',
    }],
    ...overrides,
  }
}

describe('executeEndpointResyncPlan', () => {
  it('runs every endpoint mutation inside one interactive transaction', async () => {
    const calls: string[] = []
    let inTransaction = false

    const endpoint = {
      updateMany: async () => {
        expect(inTransaction).toBe(true)
        calls.push('updateMany')
        return { count: 1 }
      },
      update: async () => {
        expect(inTransaction).toBe(true)
        calls.push('update')
        return {}
      },
      create: async () => {
        expect(inTransaction).toBe(true)
        calls.push('create')
        return {}
      },
    }

    const db = {
      $transaction: async <T>(
        fn: (tx: { endpoint: typeof endpoint }) => Promise<T>,
        options?: { timeout?: number },
      ) => {
        expect(inTransaction).toBe(false)
        expect(options).toEqual({ timeout: 30000 })
        calls.push('transaction:start')
        inTransaction = true
        const result = await fn({ endpoint })
        inTransaction = false
        calls.push('transaction:end')
        return result
      },
    }

    await executeEndpointResyncPlan(
      db as unknown as EndpointTransactionClient,
      'host-1',
      plan(),
      new Date('2026-06-19T00:00:00Z'),
    )

    expect(calls).toEqual([
      'transaction:start',
      'updateMany',
      'updateMany',
      'update',
      'create',
      'transaction:end',
    ])
  })
})

describe('reconcileFetchedEndpoints', () => {
  it('takes a per-host advisory lock before reading active endpoints and writing the plan', async () => {
    const calls: string[] = []
    let inTransaction = false

    const endpoint = {
      findMany: async () => {
        expect(inTransaction).toBe(true)
        calls.push('findMany')
        return []
      },
      count: async () => {
        expect(inTransaction).toBe(true)
        calls.push('count')
        return 1
      },
      updateMany: async () => {
        expect(inTransaction).toBe(true)
        calls.push('updateMany')
        return { count: 0 }
      },
      update: async () => {
        expect(inTransaction).toBe(true)
        calls.push('update')
        return {}
      },
      create: async () => {
        expect(inTransaction).toBe(true)
        calls.push('create')
        return {}
      },
    }
    const tx = {
      endpoint,
      $queryRaw: async () => {
        expect(inTransaction).toBe(true)
        calls.push('advisory-lock')
        return [{ acquired: true }]
      },
    }
    const db = {
      $transaction: async <T>(
        fn: (transactionClient: typeof tx) => Promise<T>,
        options?: { timeout?: number },
      ) => {
        expect(options).toEqual({ timeout: 30000 })
        calls.push('transaction:start')
        inTransaction = true
        const result = await fn(tx)
        inTransaction = false
        calls.push('transaction:end')
        return result
      },
    }

    const result = await reconcileFetchedEndpoints(
      db as unknown as EndpointResyncWriteClient,
      'host-1',
      [{
        mac: 'aa:bb:cc:dd:ee:ff',
        ip: '10.0.0.1',
        vlan: 'vlan-100',
        dn: 'uni/tn-t/ap-a/epg-web/cep-aa:bb:cc:dd:ee:ff',
        node: '101',
        interface: 'eth1/1',
        epgDescr: 'Web',
      }],
      new Date('2026-06-19T00:00:00Z'),
    )

    expect(result).toEqual({ total: 1 })
    expect(calls).toEqual([
      'transaction:start',
      'advisory-lock',
      'findMany',
      'create',
      'count',
      'transaction:end',
    ])
  })

  it('fails before reading or writing when the host advisory lock is already held', async () => {
    const calls: string[] = []
    let inTransaction = false
    const endpoint = {
      findMany: async () => {
        calls.push('findMany')
        return []
      },
      count: async () => {
        calls.push('count')
        return 0
      },
      updateMany: async () => {
        calls.push('updateMany')
        return { count: 0 }
      },
      update: async () => {
        calls.push('update')
        return {}
      },
      create: async () => {
        calls.push('create')
        return {}
      },
    }
    const tx = {
      endpoint,
      $queryRaw: async () => {
        expect(inTransaction).toBe(true)
        calls.push('advisory-lock')
        return [{ acquired: false }]
      },
    }
    const db = {
      $transaction: async <T>(
        fn: (transactionClient: typeof tx) => Promise<T>,
        options?: { timeout?: number },
      ) => {
        expect(options).toEqual({ timeout: 30000 })
        calls.push('transaction:start')
        inTransaction = true
        try {
          return await fn(tx)
        } finally {
          inTransaction = false
          calls.push('transaction:end')
        }
      },
    }

    let thrown: unknown
    try {
      await reconcileFetchedEndpoints(
        db as unknown as EndpointResyncWriteClient,
        'host-1',
        [],
        new Date('2026-06-19T00:00:00Z'),
      )
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeInstanceOf(EndpointResyncInProgressError)
    expect(calls).toEqual([
      'transaction:start',
      'advisory-lock',
      'transaction:end',
    ])
  })
})
