import 'server-only'

import type { Prisma } from '@prisma/client'
import { unstable_cache } from 'next/cache'
import { AuthenticationRequiredError, requireSession } from '@/lib/auth'
import { isNodeOnline } from '@/lib/apic/node-status'
import { prisma } from '@/lib/prisma'
import { summarizeInterfaces } from './summary'

const DASHBOARD_CACHE_SECONDS = 8 * 60 * 60

const HOST_SELECT = {
  id: true,
  name: true,
  host: true,
  lastInterfaceSyncAt: true,
  lastNodeSyncAt: true,
} satisfies Prisma.ApicHostSelect

const NODE_SELECT = {
  apicHostId: true,
  role: true,
  fabricSt: true,
  state: true,
} satisfies Prisma.NodeSnapshotSelect

const HARDWARE_SELECT = {
  apicHostId: true,
  type: true,
  healthy: true,
} satisfies Prisma.HardwareComponentSelect

type StoredDashboardHost = Prisma.ApicHostGetPayload<{ select: typeof HOST_SELECT }>
type StoredDashboardNode = Prisma.NodeSnapshotGetPayload<{ select: typeof NODE_SELECT }>

export type DashboardHost = {
  id: string
  name: string
  host: string
  lastInterfaceSyncAt: string | null
  lastNodeSyncAt: string | null
}

export type DashboardEndpointHostSummary = {
  hostId: string
  active: number
  latestSeenAt: string | null
}

export type DashboardEndpointData = {
  active: number
  historical: number
  vlanCount: number
  nodeCount: number
  interfaceCount: number
  byHost: DashboardEndpointHostSummary[]
}

export type DashboardInterfaceData = {
  total: number
  adminDown: number
  operDown: number
  noisy: number
}

export type DashboardNodeHostSummary = {
  hostId: string
  nodesTotal: number
  nodesOnline: number
  failedHardware: number
}

export type DashboardNodeData = {
  nodesTotal: number
  nodesOnline: number
  leafCount: number
  spineCount: number
  controllerCount: number
  hardwareTotal: number
  failedHardware: number
  failedPsu: number
  failedFan: number
  byHost: DashboardNodeHostSummary[]
}

export class DashboardReadError extends Error {
  readonly code = 'unauthorized'

  constructor() {
    super('Unauthorized')
    this.name = 'DashboardReadError'
  }
}

async function authorizeDashboardRead(): Promise<void> {
  try {
    await requireSession()
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error
    throw new DashboardReadError()
  }
}

function cacheOptions(tags: string[]) {
  return {
    tags: ['dashboard:all', ...tags],
    revalidate: DASHBOARD_CACHE_SECONDS,
  }
}

function serializeHost(host: StoredDashboardHost): DashboardHost {
  return {
    id: host.id,
    name: host.name,
    host: host.host,
    lastInterfaceSyncAt: host.lastInterfaceSyncAt?.toISOString() ?? null,
    lastNodeSyncAt: host.lastNodeSyncAt?.toISOString() ?? null,
  }
}

export async function getDashboardHosts(): Promise<DashboardHost[]> {
  await authorizeDashboardRead()
  return unstable_cache(async () => {
    const hosts = await prisma.apicHost.findMany({
      orderBy: { createdAt: 'desc' },
      select: HOST_SELECT,
    })
    return hosts.map(serializeHost)
  }, ['dashboard', 'hosts'], cacheOptions([
    'endpoints:all',
    'interfaces:all',
    'nodes:all',
  ]))()
}

export async function getDashboardEndpoints(): Promise<DashboardEndpointData> {
  await authorizeDashboardRead()
  return unstable_cache(async () => {
    const [statusRows, vlanRows, nodeRows, interfaceRows, freshnessRows] = await Promise.all([
      prisma.endpoint.groupBy({
        by: ['apicHostId', 'isActive'],
        _count: { _all: true },
      }),
      prisma.endpoint.findMany({ select: { vlan: true }, distinct: ['vlan'] }),
      prisma.endpoint.findMany({ select: { node: true }, distinct: ['node'] }),
      prisma.endpoint.findMany({ select: { interface: true }, distinct: ['interface'] }),
      prisma.endpoint.groupBy({
        by: ['apicHostId'],
        _max: { lastSeenAt: true },
      }),
    ])

    const byHost = new Map<string, DashboardEndpointHostSummary>()
    for (const row of statusRows) {
      const current = byHost.get(row.apicHostId) ?? {
        hostId: row.apicHostId,
        active: 0,
        latestSeenAt: null,
      }
      if (row.isActive) current.active += row._count._all
      byHost.set(row.apicHostId, current)
    }
    for (const row of freshnessRows) {
      const current = byHost.get(row.apicHostId) ?? {
        hostId: row.apicHostId,
        active: 0,
        latestSeenAt: null,
      }
      current.latestSeenAt = row._max.lastSeenAt?.toISOString() ?? null
      byHost.set(row.apicHostId, current)
    }

    const countStatus = (active: boolean) => statusRows
      .filter(row => row.isActive === active)
      .reduce((total, row) => total + row._count._all, 0)

    return {
      active: countStatus(true),
      historical: countStatus(false),
      vlanCount: vlanRows.filter(row => row.vlan.trim() !== '').length,
      nodeCount: nodeRows.filter(row => row.node.trim() !== '').length,
      interfaceCount: interfaceRows.filter(row => row.interface.trim() !== '').length,
      byHost: Array.from(byHost.values()).sort((a, b) => a.hostId.localeCompare(b.hostId)),
    }
  }, ['dashboard', 'endpoints'], cacheOptions(['endpoints:all']))()
}

export async function getDashboardInterfaces(): Promise<DashboardInterfaceData> {
  await authorizeDashboardRead()
  return unstable_cache(async () => {
    const [stateRows, samples] = await Promise.all([
      prisma.interfaceSnapshot.groupBy({
        by: ['adminSt', 'operSt'],
        _count: { _all: true },
      }),
      prisma.interfaceSample.findMany({
        distinct: ['interfaceId'],
        orderBy: [{ interfaceId: 'asc' }, { sampledAt: 'desc' }],
        select: {
          interfaceId: true,
          sampledAt: true,
          dRxErrors: true,
          dTxErrors: true,
          dRxDiscards: true,
          dTxDiscards: true,
          dRxCrcErrors: true,
          dRxAlignErrors: true,
        },
      }),
    ])

    return summarizeInterfaces(
      stateRows.map(row => ({
        adminSt: row.adminSt,
        operSt: row.operSt,
        count: row._count._all,
      })),
      samples,
    )
  }, ['dashboard', 'interfaces'], cacheOptions(['interfaces:all']))()
}

function countNodes(nodes: StoredDashboardNode[], role: string): number {
  return nodes.filter(node => node.role === role).length
}

export async function getDashboardNodes(): Promise<DashboardNodeData> {
  await authorizeDashboardRead()
  return unstable_cache(async () => {
    const [nodes, hardware] = await Promise.all([
      prisma.nodeSnapshot.findMany({ where: { present: true }, select: NODE_SELECT }),
      prisma.hardwareComponent.findMany({ where: { present: true }, select: HARDWARE_SELECT }),
    ])
    const hostIds = new Set([
      ...nodes.map(node => node.apicHostId),
      ...hardware.map(component => component.apicHostId),
    ])

    return {
      nodesTotal: nodes.length,
      nodesOnline: nodes.filter(isNodeOnline).length,
      leafCount: countNodes(nodes, 'leaf'),
      spineCount: countNodes(nodes, 'spine'),
      controllerCount: countNodes(nodes, 'controller'),
      hardwareTotal: hardware.length,
      failedHardware: hardware.filter(component => !component.healthy).length,
      failedPsu: hardware.filter(component => component.type === 'psu' && !component.healthy).length,
      failedFan: hardware.filter(component => component.type === 'fan' && !component.healthy).length,
      byHost: Array.from(hostIds).sort().map(hostId => {
        const hostNodes = nodes.filter(node => node.apicHostId === hostId)
        return {
          hostId,
          nodesTotal: hostNodes.length,
          nodesOnline: hostNodes.filter(isNodeOnline).length,
          failedHardware: hardware.filter(component => (
            component.apicHostId === hostId && !component.healthy
          )).length,
        }
      }),
    }
  }, ['dashboard', 'nodes'], cacheOptions(['nodes:all']))()
}
