import { describe, expect, it } from 'bun:test'
import {
  parseFabricHealthRows,
  parseNodeHealthRows,
  parseTenantHealthRows,
  parseHealthRows,
  executeHealthScoreResyncWrites,
  healthBand,
  summarizeHealth,
  type FabricHealthNode,
  type TopSystemHealthNode,
  type TenantHealthNode,
  type ParsedHealthRow,
  type HealthWriteClient,
} from './health-scores'

describe('parseFabricHealthRows', () => {
  it('maps the fabric total to a fabric-scope row with /health stripped', () => {
    const imdata: FabricHealthNode[] = [
      { fabricHealthTotal: { attributes: { dn: 'topology/health', cur: '96', twScore: '95' } } },
    ]
    const [row] = parseFabricHealthRows(imdata)
    expect(row.dn).toBe('topology')
    expect(row.scope).toBe('fabric')
    expect(row.name).toBe('Fabric')
    expect(row.score).toBe(96)
    expect(row.twScore).toBe(95)
    expect(row.node).toBeNull()
  })

  it('maps a pod total to a pod-scope row named "Pod N"', () => {
    const imdata: FabricHealthNode[] = [
      { fabricHealthTotal: { attributes: { dn: 'topology/pod-1/health', cur: '88' } } },
    ]
    const [row] = parseFabricHealthRows(imdata)
    expect(row.dn).toBe('topology/pod-1')
    expect(row.scope).toBe('pod')
    expect(row.name).toBe('Pod 1')
    expect(row.score).toBe(88)
  })
})

describe('parseNodeHealthRows', () => {
  it('maps a topSystem + healthInst child to a node-scope row', () => {
    const imdata: TopSystemHealthNode[] = [
      {
        topSystem: {
          attributes: { dn: 'topology/pod-1/node-101/sys', id: '101', name: 'leaf-101' },
          children: [{ healthInst: { attributes: { cur: '92', maxSev: 'minor' } } }],
        },
      },
    ]
    const [row] = parseNodeHealthRows(imdata)
    expect(row.dn).toBe('topology/pod-1/node-101/sys')
    expect(row.scope).toBe('node')
    expect(row.name).toBe('leaf-101')
    expect(row.node).toBe('101')
    expect(row.score).toBe(92)
    expect(row.maxSeverity).toBe('minor')
  })

  it('falls back to "Node <id>" when name is empty and skips rows without a health child', () => {
    const named: TopSystemHealthNode[] = [
      {
        topSystem: {
          attributes: { dn: 'topology/pod-1/node-102/sys', id: '102', name: '' },
          children: [{ healthInst: { attributes: { cur: '100' } } }],
        },
      },
    ]
    expect(parseNodeHealthRows(named)[0].name).toBe('Node 102')

    const noHealth: TopSystemHealthNode[] = [
      { topSystem: { attributes: { dn: 'x', id: '1', name: 'n' }, children: [] } },
    ]
    expect(parseNodeHealthRows(noHealth)).toEqual([])
  })
})

describe('parseTenantHealthRows', () => {
  it('maps an fvTenant + healthInst child to a tenant-scope row', () => {
    const imdata: TenantHealthNode[] = [
      {
        fvTenant: {
          attributes: { dn: 'uni/tn-TenantA', name: 'TenantA' },
          children: [{ healthInst: { attributes: { cur: '74' } } }],
        },
      },
    ]
    const [row] = parseTenantHealthRows(imdata)
    expect(row.dn).toBe('uni/tn-TenantA')
    expect(row.scope).toBe('tenant')
    expect(row.name).toBe('TenantA')
    expect(row.node).toBeNull()
    expect(row.score).toBe(74)
  })
})

describe('parseHealthRows', () => {
  it('concatenates fabric, node, and tenant rows', () => {
    const rows = parseHealthRows({
      fabric: [{ fabricHealthTotal: { attributes: { dn: 'topology/health', cur: '96' } } }],
      node: [
        {
          topSystem: {
            attributes: { dn: 'topology/pod-1/node-101/sys', id: '101', name: 'leaf-101' },
            children: [{ healthInst: { attributes: { cur: '92' } } }],
          },
        },
      ],
      tenant: [
        {
          fvTenant: {
            attributes: { dn: 'uni/tn-A', name: 'A' },
            children: [{ healthInst: { attributes: { cur: '74' } } }],
          },
        },
      ],
    })
    expect(rows.map(r => r.scope)).toEqual(['fabric', 'node', 'tenant'])
  })
})

describe('healthBand', () => {
  it('classifies scores into good/fair/poor by threshold', () => {
    expect(healthBand(95)).toBe('good')
    expect(healthBand(100)).toBe('good')
    expect(healthBand(94)).toBe('fair')
    expect(healthBand(80)).toBe('fair')
    expect(healthBand(79)).toBe('poor')
    expect(healthBand(0)).toBe('poor')
  })
})

describe('summarizeHealth', () => {
  const mk = (scope: ParsedHealthRow['scope'], score: number): ParsedHealthRow => ({
    dn: `${scope}-${score}`, scope, name: scope, node: null,
    score, twScore: null, prevScore: null, maxSeverity: null,
  })

  it('takes overall from the fabric row, worst+degraded from node/tenant rows', () => {
    const rows = [
      mk('fabric', 96), mk('pod', 90),
      mk('node', 99), mk('node', 70),
      mk('tenant', 85),
    ]
    expect(summarizeHealth(rows)).toEqual({ overall: 96, worstScore: 70, degradedCount: 2 })
    // degraded (<90): node 70 and tenant 85 => 2; pod/fabric excluded
  })

  it('defaults worstScore to overall when there are no node/tenant rows', () => {
    expect(summarizeHealth([mk('fabric', 88)])).toEqual({
      overall: 88, worstScore: 88, degradedCount: 0,
    })
  })
})

describe('executeHealthScoreResyncWrites', () => {
  it('runs health upserts, absent marking, sample insert, host stamp, and total count in one transaction', async () => {
    const calls: string[] = []
    let inTransaction = false
    const healthScoreSnapshot = {
      upsert: async () => {
        expect(inTransaction).toBe(true)
        calls.push('upsert')
        return {}
      },
      updateMany: async () => {
        expect(inTransaction).toBe(true)
        calls.push('updateMany')
        return { count: 0 }
      },
      count: async () => {
        expect(inTransaction).toBe(true)
        calls.push('count')
        return 1
      },
    }
    const healthScoreSample = {
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
        healthScoreSnapshot: typeof healthScoreSnapshot
        healthScoreSample: typeof healthScoreSample
        apicHost: typeof apicHost
      }) => Promise<T>, options?: { timeout?: number }) => {
        expect(options).toEqual({ timeout: 30000 })
        calls.push('transaction:start')
        inTransaction = true
        const result = await fn({ healthScoreSnapshot, healthScoreSample, apicHost })
        inTransaction = false
        calls.push('transaction:end')
        return result
      },
    }

    const result = await executeHealthScoreResyncWrites(
      db as unknown as HealthWriteClient,
      'host-1',
      [{
        dn: 'topology',
        scope: 'fabric',
        name: 'Fabric',
        node: null,
        score: 97,
        twScore: null,
        prevScore: null,
        maxSeverity: null,
      }],
      new Date('2026-06-19T00:00:00Z'),
    )

    expect(result).toEqual({
      total: 1,
      summary: { overall: 97, worstScore: 97, degradedCount: 0 },
    })
    expect(calls).toEqual([
      'transaction:start',
      'upsert',
      'updateMany',
      'sample',
      'host',
      'count',
      'transaction:end',
    ])
  })
})
