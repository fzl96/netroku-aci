import { prisma } from '@/lib/prisma'
import { apicFetch, apicLogin } from './client'
import { isNodeOnline } from './node-status'
export { isNodeOnline } from './node-status'

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

async function getJson<T>(host: string, token: string, path: string): Promise<T[]> {
  const res = await apicFetch(host, path, { token })
  if (!res.ok) throw new Error(`APIC GET ${path} failed: ${res.status}`)
  const data = (await res.json()) as { imdata?: T[] }
  return data.imdata ?? []
}

export async function fetchNodesFromApic(
  host: string,
  username: string,
  plaintextPassword: string,
): Promise<{ nodes: NodeRow[]; components: ComponentRow[] }> {
  const token = await apicLogin(host, username, plaintextPassword)
  const [fabricNodes, topSystem, psus, fans] = await Promise.all([
    getJson<FabricNodeMo>(host, token, '/api/node/class/fabricNode.json'),
    getJson<TopSystemMo>(host, token, '/api/node/class/topSystem.json'),
    getJson<EqptPsuMo>(host, token, '/api/node/class/eqptPsu.json'),
    getJson<EqptFanMo>(host, token, '/api/node/class/eqptFan.json'),
  ])
  const nodes = mergeNodes(parseFabricNodeRows(fabricNodes), parseTopSystemRows(topSystem))
  const components = [...parsePsuRows(psus), ...parseFanRows(fans)]
  return { nodes, components }
}

const NODES_CHUNK_SIZE = 100

export interface ResyncNodesArgs {
  apicHostId: string
  host: string
  username: string
  password: string
}

export interface ResyncNodesResult {
  syncedNodes: number
  syncedComponents: number
  nodesOnline: number
}

/**
 * Fetch node inventory + PSU/fan components from APIC and persist them for one host.
 * Upserts NodeSnapshot and HardwareComponent (both with present-detection), then
 * records one NodeStatusSample for the trend.
 */
export async function resyncNodes(args: ResyncNodesArgs): Promise<ResyncNodesResult> {
  const { apicHostId, host, username, password } = args

  const { nodes, components } = await fetchNodesFromApic(host, username, password)

  const nodeMap = new Map<string, NodeRow>()
  for (const n of nodes) if (n.dn) nodeMap.set(n.dn, n)
  const uniqueNodes = Array.from(nodeMap.values())

  const compMap = new Map<string, ComponentRow>()
  for (const c of components) if (c.dn) compMap.set(c.dn, c)
  const uniqueComponents = Array.from(compMap.values())

  const now = new Date()

  // Phase 1: upsert NodeSnapshot rows (chunked).
  for (let i = 0; i < uniqueNodes.length; i += NODES_CHUNK_SIZE) {
    const chunk = uniqueNodes.slice(i, i + NODES_CHUNK_SIZE)
    await prisma.$transaction(
      chunk.map(n =>
        prisma.nodeSnapshot.upsert({
          where: { apicHostId_dn: { apicHostId, dn: n.dn } },
          update: {
            nodeId: n.nodeId, name: n.name, role: n.role, model: n.model,
            serial: n.serial, version: n.version, fabricSt: n.fabricSt,
            state: n.state, podId: n.podId, uptime: n.uptime,
            oobMgmtAddr: n.oobMgmtAddr, present: true, lastSeenAt: now,
          },
          create: {
            apicHostId, dn: n.dn, nodeId: n.nodeId, name: n.name, role: n.role,
            model: n.model, serial: n.serial, version: n.version, fabricSt: n.fabricSt,
            state: n.state, podId: n.podId, uptime: n.uptime, oobMgmtAddr: n.oobMgmtAddr,
            present: true, firstSeenAt: now, lastSeenAt: now,
          },
        }),
      ),
    )
  }
  await prisma.nodeSnapshot.updateMany({
    where: { apicHostId, present: true, dn: { notIn: uniqueNodes.map(n => n.dn) } },
    data: { present: false },
  })

  // Phase 2: upsert HardwareComponent rows (chunked), with stored `healthy`.
  for (let i = 0; i < uniqueComponents.length; i += NODES_CHUNK_SIZE) {
    const chunk = uniqueComponents.slice(i, i + NODES_CHUNK_SIZE)
    await prisma.$transaction(
      chunk.map(c =>
        prisma.hardwareComponent.upsert({
          where: { apicHostId_dn: { apicHostId, dn: c.dn } },
          update: {
            nodeId: c.nodeId, type: c.type, name: c.name, operSt: c.operSt,
            healthy: isComponentHealthy(c.type, c.operSt), model: c.model,
            serial: c.serial, present: true, lastSeenAt: now,
          },
          create: {
            apicHostId, dn: c.dn, nodeId: c.nodeId, type: c.type, name: c.name,
            operSt: c.operSt, healthy: isComponentHealthy(c.type, c.operSt),
            model: c.model, serial: c.serial, present: true,
            firstSeenAt: now, lastSeenAt: now,
          },
        }),
      ),
    )
  }
  await prisma.hardwareComponent.updateMany({
    where: { apicHostId, present: true, dn: { notIn: uniqueComponents.map(c => c.dn) } },
    data: { present: false },
  })

  // Phase 3: record a status sample.
  const summary = summarizeNodes(uniqueNodes, uniqueComponents)
  await prisma.nodeStatusSample.create({
    data: {
      apicHostId, sampledAt: now,
      nodesTotal: summary.nodesTotal, nodesOnline: summary.nodesOnline,
      componentsTotal: summary.componentsTotal, componentsFailed: summary.componentsFailed,
    },
  })

  await prisma.apicHost.update({
    where: { id: apicHostId },
    data: { lastNodeSyncAt: now },
  })

  return {
    syncedNodes: uniqueNodes.length,
    syncedComponents: uniqueComponents.length,
    nodesOnline: summary.nodesOnline,
  }
}
