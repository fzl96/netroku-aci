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
  epgUpserts: unknown[]
  epgUpdateManys: unknown[]
  bindingUpserts: unknown[]
  bindingUpdateManys: unknown[]
  hostUpdates: unknown[]
}

function mockClient(lockAcquired = true): { client: EpgWriteClient; calls: Calls } {
  const calls: Calls = {
    epgUpserts: [], epgUpdateManys: [], bindingUpserts: [], bindingUpdateManys: [], hostUpdates: [],
  }
  const tx = {
    epgSnapshot: {
      upsert: async (args: { where: { apicHostId_dn: { dn: string } } }) => {
        calls.epgUpserts.push(args)
        return { id: `epg-${args.where.apicHostId_dn.dn}` }
      },
      updateMany: async (args: unknown) => { calls.epgUpdateManys.push(args); return { count: 0 } },
    },
    epgPathBinding: {
      upsert: async (args: unknown) => { calls.bindingUpserts.push(args); return { id: 'b1' } },
      updateMany: async (args: unknown) => { calls.bindingUpdateManys.push(args); return { count: 0 } },
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

  it('upserts EPGs then bindings with the parent id, and marks absentees', async () => {
    const { client, calls } = mockClient()
    const epg = makeEpg()

    const result = await executeEpgResyncWrites(client, 'host-1', [epg], now)

    expect(result).toEqual({ syncedEpgs: 1, syncedBindings: 1 })
    expect(calls.epgUpserts).toHaveLength(1)
    const epgUpsert = calls.epgUpserts[0] as {
      where: { apicHostId_dn: { apicHostId: string; dn: string } }
      create: Record<string, unknown>
      update: Record<string, unknown>
    }
    expect(epgUpsert.where.apicHostId_dn).toEqual({ apicHostId: 'host-1', dn: epg.dn })
    expect(epgUpsert.create.tenant).toBe('t1')
    expect(epgUpsert.update.present).toBe(true)
    expect(epgUpsert.update.lastSeenAt).toEqual(now)

    const bindingUpsert = calls.bindingUpserts[0] as {
      where: { apicHostId_dn: { dn: string } }
      create: Record<string, unknown>
    }
    expect(bindingUpsert.create.epgId).toBe(`epg-${epg.dn}`)
    expect(bindingUpsert.create.node).toBe('101')

    // Absent EPGs and bindings flipped to present: false, scoped to still-present rows.
    const epgAbsent = calls.epgUpdateManys[0] as {
      where: { apicHostId: string; present: boolean; dn: { notIn: string[] } }
      data: { present: boolean }
    }
    expect(epgAbsent.where.dn.notIn).toEqual([epg.dn])
    expect(epgAbsent.data.present).toBe(false)
    const bindingAbsent = calls.bindingUpdateManys[0] as {
      where: { dn: { notIn: string[] } }
      data: { present: boolean }
    }
    expect(bindingAbsent.where.dn.notIn).toEqual([epg.bindings[0].dn])
    expect(bindingAbsent.data.present).toBe(false)

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
