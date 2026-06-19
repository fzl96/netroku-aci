import { describe, expect, it } from 'bun:test'
import { executeEndpointResyncPlan } from './endpoints'
import type { EndpointTransactionClient } from './endpoints'
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
