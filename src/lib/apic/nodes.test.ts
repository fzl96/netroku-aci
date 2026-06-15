import { describe, expect, it } from 'bun:test'
import {
  parseFabricNodeRows,
  parseTopSystemRows,
  mergeNodes,
  type FabricNodeMo,
  type TopSystemMo,
} from './nodes'

describe('parseFabricNodeRows', () => {
  it('maps fabricNode attributes and derives podId', () => {
    const imdata: FabricNodeMo[] = [
      {
        fabricNode: {
          attributes: {
            dn: 'topology/pod-1/node-101',
            id: '101', name: 'leaf-101', role: 'leaf',
            model: 'N9K-C93180', serial: 'FDO123', fabricSt: 'active',
          },
        },
      },
    ]
    const [row] = parseFabricNodeRows(imdata)
    expect(row.dn).toBe('topology/pod-1/node-101')
    expect(row.nodeId).toBe('101')
    expect(row.name).toBe('leaf-101')
    expect(row.role).toBe('leaf')
    expect(row.serial).toBe('FDO123')
    expect(row.fabricSt).toBe('active')
    expect(row.podId).toBe('1')
    expect(row.version).toBeNull()
  })

  it('falls back to ser when serial is absent', () => {
    const imdata: FabricNodeMo[] = [
      { fabricNode: { attributes: { dn: 'topology/pod-1/node-1', id: '1', ser: 'ABC' } } },
    ]
    expect(parseFabricNodeRows(imdata)[0].serial).toBe('ABC')
  })
})

describe('parseTopSystemRows', () => {
  it('builds a map keyed by node id with operational fields', () => {
    const imdata: TopSystemMo[] = [
      {
        topSystem: {
          attributes: {
            dn: 'topology/pod-1/node-101/sys', id: '101',
            state: 'in-service', version: 'n9000-15.2', systemUpTime: '01:02:03:04.00',
            oobMgmtAddr: '10.0.0.1', podId: '1',
          },
        },
      },
    ]
    const map = parseTopSystemRows(imdata)
    expect(map.get('101')).toEqual({
      version: 'n9000-15.2', state: 'in-service',
      uptime: '01:02:03:04.00', oobMgmtAddr: '10.0.0.1', podId: '1',
    })
  })
})

describe('mergeNodes', () => {
  it('fills operational fields from the topSystem map when present', () => {
    const fabricNodes = parseFabricNodeRows([
      { fabricNode: { attributes: { dn: 'topology/pod-1/node-101', id: '101', role: 'leaf', fabricSt: 'active' } } },
    ])
    const topMap = parseTopSystemRows([
      { topSystem: { attributes: { dn: 'topology/pod-1/node-101/sys', id: '101', state: 'in-service', version: 'v1', systemUpTime: 'up', oobMgmtAddr: '10.0.0.1', podId: '1' } } },
    ])
    const [row] = mergeNodes(fabricNodes, topMap)
    expect(row.version).toBe('v1')
    expect(row.state).toBe('in-service')
    expect(row.uptime).toBe('up')
    expect(row.oobMgmtAddr).toBe('10.0.0.1')
  })

  it('leaves operational fields null when no topSystem entry exists', () => {
    const fabricNodes = parseFabricNodeRows([
      { fabricNode: { attributes: { dn: 'topology/pod-1/node-200', id: '200', fabricSt: 'inactive' } } },
    ])
    const [row] = mergeNodes(fabricNodes, new Map())
    expect(row.version).toBeNull()
    expect(row.state).toBeNull()
  })
})
