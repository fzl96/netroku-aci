import { describe, expect, it } from 'bun:test'
import {
  executeEpgResyncWrites,
  EpgResyncInProgressError,
  type EpgWriteClient,
} from './epg-resync'
import type { EpgRow } from './epg-inventory'

function makeEpg(overrides: Partial<EpgRow> = {}): EpgRow {
  return {
    dn: 'uni/tn-t1/ap-ap1/epg-e1',
    name: 'e1',
    tenant: 't1',
    appProfile: 'ap1',
    description: '',
    bridgeDomain: 'bd1',
    pcTag: '16386',
    preferredGroup: false,
    isolation: false,
    domains: ['PHYS (physical)'],
    providedContracts: ['c-prov'],
    consumedContracts: [],
    bindings: [
      {
        dn: 'uni/tn-t1/ap-ap1/epg-e1/rspathAtt-[topology/pod-1/paths-101/pathep-[eth1/10]]',
        pathTDn: 'topology/pod-1/paths-101/pathep-[eth1/10]',
        pod: '1',
        node: '101',
        port: 'eth1/10',
        pathType: 'port',
        encap: 'vlan-10',
        mode: 'trunk',
      },
    ],
    ...overrides,
  }
}

interface Calls {
  epgDeletes: unknown[]
  epgCreateManys: unknown[]
  bindingDeletes: unknown[]
  bindingCreateManys: unknown[]
  hostUpdates: unknown[]
}

function mockClient(lockAcquired = true): { client: EpgWriteClient; calls: Calls } {
  const calls: Calls = {
    epgDeletes: [], epgCreateManys: [], bindingDeletes: [], bindingCreateManys: [], hostUpdates: [],
  }
  const tx = {
    epgSnapshot: {
      deleteMany: async (args: unknown) => { calls.epgDeletes.push(args); return { count: 0 } },
      createMany: async (args: { data: Array<{ dn: string }> }) => {
        calls.epgCreateManys.push(args)
        return { count: args.data.length }
      },
      findMany: async (args: { where: { apicHostId: string } }) => {
        const createCall = calls.epgCreateManys[calls.epgCreateManys.length - 1] as { data: Array<{ dn: string }> } | undefined
        const data = createCall?.data ?? []
        return data.map(d => ({ id: `epg-${d.dn}`, dn: d.dn }))
      },
    },
    epgPathBinding: {
      deleteMany: async (args: unknown) => { calls.bindingDeletes.push(args); return { count: 0 } },
      createMany: async (args: { data: Array<{ epgId: string; dn: string }> }) => {
        calls.bindingCreateManys.push(args)
        return { count: args.data.length }
      },
    },
    apicHost: {
      update: async (args: unknown) => { calls.hostUpdates.push(args); return {} },
    },
    $queryRaw: async () => [{ acquired: lockAcquired }],
  }
  const client = {
    $transaction: async <T,>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
  } as unknown as EpgWriteClient
  return { client, calls }
}

describe('executeEpgResyncWrites', () => {
  const now = new Date('2026-07-13T00:00:00Z')

  it('purges existing state and bulk inserts EPGs then bindings', async () => {
    const { client, calls } = mockClient()
    const epg = makeEpg()

    const result = await executeEpgResyncWrites(client, 'host-1', [epg], now)

    expect(result).toEqual({ syncedEpgs: 1, syncedBindings: 1 })
    expect(calls.epgDeletes).toHaveLength(1)
    expect(calls.bindingDeletes).toHaveLength(1)

    expect(calls.epgCreateManys).toHaveLength(1)
    const epgCreate = calls.epgCreateManys[0] as { data: Array<Record<string, unknown>> }
    expect(epgCreate.data[0].apicHostId).toBe('host-1')
    expect(epgCreate.data[0].dn).toBe(epg.dn)
    expect(epgCreate.data[0].tenant).toBe('t1')

    expect(calls.bindingCreateManys).toHaveLength(1)
    const bindingCreate = calls.bindingCreateManys[0] as { data: Array<Record<string, unknown>> }
    expect(bindingCreate.data[0].epgId).toBe(`epg-${epg.dn}`)
    expect(bindingCreate.data[0].node).toBe('101')

    // lastEpgSyncAt stamped inside the same transaction.
    expect(calls.hostUpdates).toHaveLength(1)
    const hostUpdate = calls.hostUpdates[0] as { data: { lastEpgSyncAt: Date } }
    expect(hostUpdate.data.lastEpgSyncAt).toEqual(now)
  })

  it('throws EpgResyncInProgressError when the advisory lock is taken', async () => {
    const { client } = mockClient(false)
    await expect(executeEpgResyncWrites(client, 'host-1', [makeEpg()], now))
      .rejects.toBeInstanceOf(EpgResyncInProgressError)
  })

  it('counts bindings across all EPGs', async () => {
    const { client } = mockClient()
    const e1 = makeEpg()
    const e2 = makeEpg({
      dn: 'uni/tn-t1/ap-ap1/epg-e2',
      name: 'e2',
      bindings: [],
    })
    const result = await executeEpgResyncWrites(client, 'host-1', [e1, e2], now)
    expect(result).toEqual({ syncedEpgs: 2, syncedBindings: 1 })
  })
})

