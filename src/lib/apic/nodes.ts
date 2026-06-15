import { prisma } from '@/lib/prisma'
import { apicFetch, apicLogin } from './client'

export interface NodeRow {
  dn: string
  nodeId: string
  name: string
  role: string
  model: string
  serial: string
  version: string | null
  fabricSt: string
  state: string | null
  podId: string | null
  uptime: string | null
  oobMgmtAddr: string | null
}

export interface ComponentRow {
  dn: string
  nodeId: string
  type: 'psu' | 'fan'
  name: string
  operSt: string
  model: string
  serial: string
}

export interface FabricNodeMo {
  fabricNode?: { attributes: Record<string, string> }
}
export interface TopSystemMo {
  topSystem?: { attributes: Record<string, string> }
}
export interface EqptPsuMo {
  eqptPsu?: { attributes: Record<string, string> }
}
export interface EqptFanMo {
  eqptFan?: { attributes: Record<string, string> }
}

export interface TopSystemFields {
  version: string | null
  state: string | null
  uptime: string | null
  oobMgmtAddr: string | null
  podId: string | null
}

const NODE_RE = /node-(\d+)\b/
const POD_RE = /pod-(\d+)\b/

function nodeIdFromDn(dn: string): string {
  return NODE_RE.exec(dn)?.[1] ?? ''
}

function podIdFromDn(dn: string): string | null {
  return POD_RE.exec(dn)?.[1] ?? null
}

export function parseFabricNodeRows(imdata: FabricNodeMo[]): NodeRow[] {
  const rows: NodeRow[] = []
  for (const item of imdata) {
    const mo = item.fabricNode
    if (!mo) continue
    const a = mo.attributes
    rows.push({
      dn: a.dn,
      nodeId: a.id ?? nodeIdFromDn(a.dn),
      name: a.name ?? '',
      role: a.role ?? '',
      model: a.model ?? '',
      serial: a.serial ?? a.ser ?? '',
      version: null,
      fabricSt: a.fabricSt ?? '',
      state: null,
      podId: podIdFromDn(a.dn),
      uptime: null,
      oobMgmtAddr: null,
    })
  }
  return rows
}

export function parseTopSystemRows(imdata: TopSystemMo[]): Map<string, TopSystemFields> {
  const map = new Map<string, TopSystemFields>()
  for (const item of imdata) {
    const mo = item.topSystem
    if (!mo) continue
    const a = mo.attributes
    const id = a.id ?? nodeIdFromDn(a.dn)
    if (!id) continue
    map.set(id, {
      version: a.version ?? null,
      state: a.state ?? null,
      uptime: a.systemUpTime ?? null,
      oobMgmtAddr: a.oobMgmtAddr ?? null,
      podId: a.podId ?? null,
    })
  }
  return map
}

export function mergeNodes(
  fabricNodes: NodeRow[],
  topSystemByNode: Map<string, TopSystemFields>,
): NodeRow[] {
  return fabricNodes.map(node => {
    const top = topSystemByNode.get(node.nodeId)
    if (!top) return node
    return {
      ...node,
      version: top.version,
      state: top.state,
      uptime: top.uptime,
      oobMgmtAddr: top.oobMgmtAddr,
      podId: node.podId ?? top.podId,
    }
  })
}

export function parsePsuRows(imdata: EqptPsuMo[]): ComponentRow[] {
  const rows: ComponentRow[] = []
  for (const item of imdata) {
    const mo = item.eqptPsu
    if (!mo) continue
    const a = mo.attributes
    rows.push({
      dn: a.dn,
      nodeId: nodeIdFromDn(a.dn),
      type: 'psu',
      name: a.id ?? '',
      operSt: a.operSt ?? '',
      model: a.model ?? '',
      serial: a.ser ?? a.serial ?? '',
    })
  }
  return rows
}

export function parseFanRows(imdata: EqptFanMo[]): ComponentRow[] {
  const rows: ComponentRow[] = []
  for (const item of imdata) {
    const mo = item.eqptFan
    if (!mo) continue
    const a = mo.attributes
    rows.push({
      dn: a.dn,
      nodeId: nodeIdFromDn(a.dn),
      type: 'fan',
      name: a.id ?? '',
      operSt: a.operSt ?? '',
      model: a.model ?? '',
      serial: a.ser ?? a.serial ?? '',
    })
  }
  return rows
}

export function isNodeOnline(node: Pick<NodeRow, 'fabricSt'>): boolean {
  return node.fabricSt === 'active'
}

const HEALTHY_OPER_ST = new Set(['on', 'ok'])

export function isComponentHealthy(
  _type: ComponentRow['type'],
  operSt: string,
): boolean {
  return HEALTHY_OPER_ST.has(operSt.toLowerCase())
}

export interface NodeSummary {
  nodesTotal: number
  nodesOnline: number
  componentsTotal: number
  componentsFailed: number
}

export function summarizeNodes(nodes: NodeRow[], components: ComponentRow[]): NodeSummary {
  return {
    nodesTotal: nodes.length,
    nodesOnline: nodes.filter(isNodeOnline).length,
    componentsTotal: components.length,
    componentsFailed: components.filter(c => !isComponentHealthy(c.type, c.operSt)).length,
  }
}
