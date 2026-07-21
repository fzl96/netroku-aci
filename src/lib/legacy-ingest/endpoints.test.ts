import { describe, expect, it } from 'bun:test'
import { applyLegacyEndpoints, planLegacyEndpointReconcile } from './endpoints'

const endpoint = {
  mac: '00:11:22:33:44:55', ip: null, interface: 'GigabitEthernet1/0/1',
  vlan: '10', vlan_name: 'USERS', learning_type: 'dynamic',
}

describe('planLegacyEndpointReconcile', () => {
  const active = [{
    id: 'old', mac: endpoint.mac, ipKey: '',
    interfaceKey: 'gigabitethernet1/0/1', vlan: '10',
  }]

  it('inserts new, updates unchanged, and clears missing endpoints', () => {
    expect(planLegacyEndpointReconcile([], [endpoint]).inserts).toHaveLength(1)
    expect(planLegacyEndpointReconcile(active, [endpoint]).updates).toHaveLength(1)
    expect(planLegacyEndpointReconcile(active, []).clears).toEqual(['old'])
  })

  it('clears and reinserts placement moves', () => {
    const plan = planLegacyEndpointReconcile(active, [{ ...endpoint, vlan: '20' }])
    expect(plan.clears).toEqual(['old'])
    expect(plan.inserts).toHaveLength(1)
    expect(plan.updates).toHaveLength(0)
  })

  it('deduplicates fetched endpoint identities', () => {
    const plan = planLegacyEndpointReconcile([], [endpoint, { ...endpoint }])
    expect(plan.inserts).toHaveLength(1)
  })
})

describe('applyLegacyEndpoints', () => {
  it('clears before inserts and records lifecycle counts', async () => {
    const order: string[] = []
    const tx = {
      legacyEndpoint: {
        findMany: async () => [{
          id: 'old', mac: endpoint.mac, ipKey: '',
          interfaceKey: 'gigabitethernet1/0/1', vlan: '10',
        }],
        updateMany: async () => { order.push('clear'); return { count: 1 } },
        update: async () => { order.push('update') },
        createMany: async (args: { data: unknown[] }) => {
          order.push('insert')
          return { count: args.data.length }
        },
      },
      legacyDevice: { update: async () => { order.push('device') } },
    }
    const payload = {
      schema_version: 1 as const,
      run_id: '18d187a6-6509-40bd-b246-cc3798780efa',
      collected_at: '2026-07-21T14:30:00+07:00',
      complete: true as const,
      device: {
        site: 'jakarta', hostname: 'sw1', management_ip: '10.0.0.1', device_type: 'cisco_ios',
      },
      endpoints: [{ ...endpoint, interface: 'GigabitEthernet1/0/2' }],
    }

    const counts = await applyLegacyEndpoints({
      tx, deviceId: 'device-1', receiptId: 'receipt-1',
      collectedAt: new Date(payload.collected_at),
    }, payload)

    expect(counts).toEqual({ inserted: 1, updated: 0, cleared: 1, samples: 0 })
    expect(order.slice(0, 2)).toEqual(['clear', 'insert'])
  })
})
