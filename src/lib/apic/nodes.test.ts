import { describe, expect, it } from 'bun:test'
import {
  parseFabricNodeRows,
  parseTopSystemRows,
  mergeNodes,
  type FabricNodeMo,
  type TopSystemMo,
} from './nodes'
import {
  parsePsuRows,
  parseFanRows,
  isNodeOnline,
  isComponentHealthy,
  summarizeNodes,
  type EqptPsuMo,
  type EqptFanMo,
  type NodeRow,
  type ComponentRow,
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

describe('parsePsuRows', () => {
  it('maps eqptPsu to a psu component row with node id from dn', () => {
    const imdata: EqptPsuMo[] = [
      {
        eqptPsu: {
          attributes: {
            dn: 'topology/pod-1/node-101/sys/ch/psuslot-1/psu',
            id: '1', operSt: 'on', model: 'NXA-PAC-650', ser: 'PSU123',
          },
        },
      },
    ]
    const [row] = parsePsuRows(imdata)
    expect(row.type).toBe('psu')
    expect(row.nodeId).toBe('101')
    expect(row.name).toBe('1')
    expect(row.operSt).toBe('on')
    expect(row.serial).toBe('PSU123')
  })
})

describe('parseFanRows', () => {
  it('maps eqptFan to a fan component row', () => {
    const imdata: EqptFanMo[] = [
      {
        eqptFan: {
          attributes: {
            dn: 'topology/pod-1/node-101/sys/ch/ftslot-1/ft/fan-1',
            id: '1', operSt: 'ok', model: 'NXA-FAN',
          },
        },
      },
    ]
    const [row] = parseFanRows(imdata)
    expect(row.type).toBe('fan')
    expect(row.nodeId).toBe('101')
    expect(row.operSt).toBe('ok')
  })
})

describe('isNodeOnline', () => {
  it('treats fabric-active nodes as online', () => {
    expect(isNodeOnline({ fabricSt: 'active' } as NodeRow)).toBe(true)
    expect(isNodeOnline({ fabricSt: 'inactive' } as NodeRow)).toBe(false)
  })

  it('treats in-service controllers as online even when fabricSt is not active', () => {
    expect(isNodeOnline({ role: 'controller', fabricSt: 'unknown', state: 'in-service' } as NodeRow)).toBe(true)
    expect(isNodeOnline({ role: 'controller', fabricSt: 'commissioned', state: 'in-service' } as NodeRow)).toBe(true)
  })
})

describe('isComponentHealthy', () => {
  it('treats on/ok as healthy (case-insensitive), others as failed', () => {
    expect(isComponentHealthy('psu', 'on')).toBe(true)
    expect(isComponentHealthy('psu', 'OK')).toBe(true)
    expect(isComponentHealthy('psu', 'shut')).toBe(false)
    expect(isComponentHealthy('fan', 'ok')).toBe(true)
    expect(isComponentHealthy('fan', 'fail')).toBe(false)
  })
})

describe('summarizeNodes', () => {
  it('counts online nodes and failed components', () => {
    const nodes = [
      { fabricSt: 'active' }, { fabricSt: 'active' }, { fabricSt: 'inactive' },
    ] as NodeRow[]
    const components = [
      { type: 'psu', operSt: 'on' }, { type: 'psu', operSt: 'shut' },
      { type: 'fan', operSt: 'ok' },
    ] as ComponentRow[]
    expect(summarizeNodes(nodes, components)).toEqual({
      nodesTotal: 3, nodesOnline: 2, componentsTotal: 3, componentsFailed: 1,
    })
  })
})
