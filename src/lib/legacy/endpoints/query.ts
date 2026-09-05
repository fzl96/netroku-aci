import 'server-only'

import type { Prisma } from '@prisma/client'
import { unstable_cache } from 'next/cache'
import { AuthenticationRequiredError, requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { LegacyPageSize } from '@/lib/legacy/query'
import { buildLegacyEndpointWhere, LEGACY_ENDPOINT_ORDER_BY } from './filters'
import type { LegacyEndpointPageParams } from './params'

const LEGACY_ENDPOINT_CACHE_SECONDS = 28_800
const LEGACY_ENDPOINT_TAG = 'legacy-endpoints:all'

const ENDPOINT_SELECT = {
  id: true,
  deviceId: true,
  mac: true,
  macFlag: true,
  ip: true,
  vlan: true,
  vlanName: true,
  interface: true,
  learningType: true,
  isActive: true,
  firstSeenAt: true,
  lastSeenAt: true,
  clearedAt: true,
  device: { select: { hostname: true, site: true, managementIp: true } },
} satisfies Prisma.LegacyEndpointSelect

type StoredLegacyEndpoint = Prisma.LegacyEndpointGetPayload<{ select: typeof ENDPOINT_SELECT }>

export type LegacyEndpointRow = {
  id: string
  deviceId: string
  hostname: string
  site: string
  managementIp: string
  mac: string
  macFlag: string
  ip: string | null
  vlan: string
  vlanName: string
  interface: string
  learningType: string
  isActive: boolean
  firstSeenAt: string
  lastSeenAt: string
  clearedAt: string | null
}

export type LegacyEndpointSummary = {
  total: number
  active: number
  historical: number
  vlans: number
}

export type LegacyEndpointDeviceOption = { id: string; hostname: string; site: string }
export type LegacyEndpointFilterOptions = {
  sites: string[]
  devices: LegacyEndpointDeviceOption[]
  vlans: string[]
  interfaces: string[]
}

export type LegacyEndpointResults = {
  rows: LegacyEndpointRow[]
  total: number
  page: number
  pageSize: LegacyPageSize
}

export type LegacyEndpointLoadState<T> = { kind: 'ready'; data: T } | { kind: 'unauthorized' }

export type LegacyEndpointFiltersPayload = {
  params: LegacyEndpointPageParams
  options: LegacyEndpointFilterOptions
}

export type LegacyEndpointReadErrorCode = 'unauthorized' | 'read-failed'

export class LegacyEndpointReadError extends Error {
  constructor(
    readonly code: LegacyEndpointReadErrorCode = 'unauthorized',
    options?: ErrorOptions,
  ) {
    super(code === 'unauthorized' ? 'Unauthorized' : 'Unable to load legacy endpoints', options)
    this.name = 'LegacyEndpointReadError'
  }
}

async function authorize(): Promise<void> {
  try {
    await requireSession()
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error
    throw new LegacyEndpointReadError()
  }
}

async function readEndpointData<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read()
  } catch (error) {
    if (error instanceof LegacyEndpointReadError) throw error
    throw new LegacyEndpointReadError('read-failed', { cause: error })
  }
}

const cacheOptions = {
  tags: [LEGACY_ENDPOINT_TAG],
  revalidate: LEGACY_ENDPOINT_CACHE_SECONDS,
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  )
}

function serializeEndpoint(record: StoredLegacyEndpoint): LegacyEndpointRow {
  return {
    id: record.id,
    deviceId: record.deviceId,
    hostname: record.device.hostname,
    site: record.device.site,
    managementIp: record.device.managementIp,
    mac: record.mac,
    macFlag: record.macFlag,
    ip: record.ip,
    vlan: record.vlan,
    vlanName: record.vlanName,
    interface: record.interface,
    learningType: record.learningType,
    isActive: record.isActive,
    firstSeenAt: record.firstSeenAt.toISOString(),
    lastSeenAt: record.lastSeenAt.toISOString(),
    clearedAt: record.clearedAt?.toISOString() ?? null,
  }
}

export async function getLegacyEndpointSummary(): Promise<LegacyEndpointSummary> {
  await authorize()
  return readEndpointData(() =>
    unstable_cache(
      async () => {
        const [total, active, historical, vlanRows] = await Promise.all([
          prisma.legacyEndpoint.count(),
          prisma.legacyEndpoint.count({ where: { isActive: true } }),
          prisma.legacyEndpoint.count({ where: { isActive: false } }),
          prisma.legacyEndpoint.findMany({ distinct: ['vlan'], select: { vlan: true } }),
        ])
        return { total, active, historical, vlans: vlanRows.length }
      },
      ['legacy-endpoints', 'summary'],
      cacheOptions,
    )(),
  )
}

export async function getLegacyEndpointFilterOptions(): Promise<LegacyEndpointFilterOptions> {
  await authorize()
  return readEndpointData(() =>
    unstable_cache(
      async () => {
        const [devices, vlanRows, interfaceRows] = await Promise.all([
          prisma.legacyDevice.findMany({
            select: { id: true, hostname: true, site: true },
            orderBy: { hostname: 'asc' },
          }),
          prisma.legacyEndpoint.findMany({
            distinct: ['vlan'],
            select: { vlan: true },
            orderBy: { vlan: 'asc' },
          }),
          prisma.legacyEndpoint.findMany({
            distinct: ['interface'],
            select: { interface: true },
            orderBy: { interface: 'asc' },
          }),
        ])
        return {
          sites: unique(devices.map((device) => device.site)),
          devices,
          vlans: unique(vlanRows.map((row) => row.vlan)),
          interfaces: unique(interfaceRows.map((row) => row.interface)),
        }
      },
      ['legacy-endpoints', 'filter-options'],
      cacheOptions,
    )(),
  )
}

export async function getLegacyEndpointResults(
  params: LegacyEndpointPageParams,
): Promise<LegacyEndpointResults> {
  await authorize()
  return readEndpointData(() =>
    unstable_cache(
      async (): Promise<LegacyEndpointResults> => {
        const where = buildLegacyEndpointWhere({
          query: params.query,
          sites: params.sites,
          deviceIds: params.devices,
          vlans: params.vlans,
          interfaces: params.interfaces,
          statuses: params.statuses,
        })
        const [records, total] = await Promise.all([
          prisma.legacyEndpoint.findMany({
            where,
            orderBy: LEGACY_ENDPOINT_ORDER_BY,
            skip: (params.page - 1) * params.pageSize,
            take: params.pageSize,
            select: ENDPOINT_SELECT,
          }),
          prisma.legacyEndpoint.count({ where }),
        ])
        return {
          rows: records.map(serializeEndpoint),
          total,
          page: params.page,
          pageSize: params.pageSize,
        }
      },
      [
        'legacy-endpoints',
        'results',
        params.query,
        params.sites.join(','),
        params.devices.join(','),
        params.vlans.join(','),
        params.interfaces.join(','),
        params.statuses.join(',') || 'all',
        String(params.page),
        String(params.pageSize),
      ],
      cacheOptions,
    )(),
  )
}
