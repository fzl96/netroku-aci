import { describe, expect, it } from 'bun:test'
import {
  parseFabricHealthRows,
  parseNodeHealthRows,
  parseTenantHealthRows,
  parseHealthRows,
  type FabricHealthNode,
  type TopSystemHealthNode,
  type TenantHealthNode,
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
