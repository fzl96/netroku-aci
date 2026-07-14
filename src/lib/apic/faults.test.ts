import { describe, expect, it } from 'bun:test'
import {
  executeFaultResyncWrites,
  parseFaultRows,
  tallyFaultCounts,
  selectClearedDns,
  type FaultInstNode,
  type FaultWriteClient,
} from './faults'

describe('parseFaultRows', () => {
  it('maps a faultInst MO to a fault row', () => {
    const imdata: FaultInstNode[] = [
      {
        faultInst: {
          attributes: {
            dn: 'topology/pod-1/node-101/sys/phys-[eth1/1]/phys/fault-F1394',
            code: 'F1394',
            severity: 'major',
            domain: 'access',
            type: 'operational',
            cause: 'threshold-crossed',
            descr: 'rx errors high',
            ack: 'no',
            created: '2026-06-14T10:00:00.000+00:00',
            lastTransition: '2026-06-14T10:05:00.000+00:00',
          },
        },
      },
    ]
    const [row] = parseFaultRows(imdata)
    expect(row.dn).toBe('topology/pod-1/node-101/sys/phys-[eth1/1]/phys/fault-F1394')
    expect(row.code).toBe('F1394')
    expect(row.severity).toBe('major')
    expect(row.affectedDn).toBe('topology/pod-1/node-101/sys/phys-[eth1/1]/phys')
    expect(row.node).toBe('101')
    expect(row.ack).toBe(false)
    expect(row.created).toEqual(new Date('2026-06-14T10:00:00.000+00:00'))
  })

  it('derives null node for non-topology affected DNs', () => {
    const imdata: FaultInstNode[] = [
      {
        faultInst: {
          attributes: {
            dn: 'uni/tn-TenantA/fault-F0467',
            code: 'F0467',
            severity: 'minor',
            ack: 'yes',
          },
        },
      },
    ]
    const [row] = parseFaultRows(imdata)
    expect(row.affectedDn).toBe('uni/tn-TenantA')
    expect(row.node).toBeNull()
    expect(row.ack).toBe(true)
  })

  it('tolerates missing optional fields', () => {
    const imdata: FaultInstNode[] = [
      { faultInst: { attributes: { dn: 'uni/fault-F1', code: 'F1', severity: 'warning' } } },
    ]
    const [row] = parseFaultRows(imdata)
    expect(row.domain).toBe('')
    expect(row.descr).toBe('')
    expect(row.created).toBeNull()
    expect(row.node).toBeNull()
  })

  it('skips entries without a faultInst body', () => {
    expect(parseFaultRows([{} as FaultInstNode])).toEqual([])
  })
})

describe('tallyFaultCounts', () => {
  it('counts rows by severity and totals them', () => {
    const rows = [
      { severity: 'critical' }, { severity: 'major' }, { severity: 'major' },
      { severity: 'minor' }, { severity: 'warning' }, { severity: 'unknown' },
    ] as Parameters<typeof tallyFaultCounts>[0]
    expect(tallyFaultCounts(rows)).toEqual({
      critical: 1, major: 2, minor: 1, warning: 1, total: 6,
    })
  })
})

describe('selectClearedDns', () => {
  it('returns previously-active DNs absent from the current set', () => {
    const previousActive = ['a/fault-F1', 'b/fault-F2', 'c/fault-F3']
    const currentDns = new Set(['b/fault-F2'])
    expect(selectClearedDns(previousActive, currentDns).sort()).toEqual(
      ['a/fault-F1', 'c/fault-F3'],
    )
  })

  it('returns empty when all previous faults are still present', () => {
    expect(selectClearedDns(['x'], new Set(['x']))).toEqual([])
  })
})

describe('executeFaultResyncWrites', () => {
  it('runs fault upserts, cleared detection, sample insert, and host stamp in one transaction', async () => {
    const calls: string[] = []
    let inTransaction = false
    const faultSnapshot = {
      upsert: async () => {
        expect(inTransaction).toBe(true)
        calls.push('upsert')
        return {}
      },
      findMany: async () => {
        expect(inTransaction).toBe(true)
        calls.push('findMany')
        return [{ dn: 'old/fault-F1' }]
      },
      updateMany: async () => {
        expect(inTransaction).toBe(true)
        calls.push('updateMany')
        return { count: 1 }
      },
      count: async () => {
        expect(inTransaction).toBe(true)
        calls.push('count')
        return 1
      },
    }
    const faultCountSample = {
      create: async () => {
        expect(inTransaction).toBe(true)
        calls.push('sample')
        return {}
      },
    }
    const apicHost = {
      update: async () => {
        expect(inTransaction).toBe(true)
        calls.push('host')
        return {}
      },
    }
    const db = {
      $transaction: async <T>(fn: (tx: {
        faultSnapshot: typeof faultSnapshot
        faultCountSample: typeof faultCountSample
        apicHost: typeof apicHost
      }) => Promise<T>, options?: { timeout?: number }) => {
        expect(options).toEqual({ timeout: 30000 })
        calls.push('transaction:start')
        inTransaction = true
        const result = await fn({ faultSnapshot, faultCountSample, apicHost })
        inTransaction = false
        calls.push('transaction:end')
        return result
      },
    }

    const result = await executeFaultResyncWrites(
      db as unknown as FaultWriteClient,
      'host-1',
      [{
        dn: 'new/fault-F2',
        code: 'F2',
        severity: 'critical',
        domain: '',
        type: '',
        cause: '',
        affectedDn: 'new',
        node: null,
        descr: '',
        ack: false,
        created: null,
        lastTransition: null,
      }],
      new Date('2026-06-19T00:00:00Z'),
    )

    expect(result.total).toBe(1)
    expect(calls).toEqual([
      'transaction:start',
      'upsert',
      'findMany',
      'updateMany',
      'sample',
      'host',
      'count',
      'transaction:end',
    ])
  })
})
