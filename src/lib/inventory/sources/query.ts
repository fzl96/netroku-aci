import 'server-only'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { authorizeInventoryRead } from '@/lib/inventory/authorize'
import { nodeObservation, legacyObservation, observationReviewToken } from './outbox'
import { serialKey, sourceKey } from './identity'

export async function getWorkerHealth() {
  await authorizeInventoryRead()
  const [health, pending, failed, oldest] = await Promise.all([
    prisma.inventoryWorkerHealth.findUnique({ where: { id: 'inventory' } }),
    prisma.inventoryReconcileJob.count({ where: { completedAt: null } }),
    prisma.inventoryReconcileJob.count({ where: { completedAt: null, attempts: { gt: 0 } } }),
    prisma.inventoryReconcileJob.findFirst({
      where: { completedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ])
  const threshold =
    Math.max(1200, Number(process.env.INVENTORY_WORKER_STALE_AFTER_SECONDS) || 1200) * 1000
  const state = !process.env.SCHEDULER_TOKEN
    ? 'Worker not configured'
    : !health?.lastCompletedAt
      ? 'Worker not observed'
      : Date.now() - health.lastCompletedAt.getTime() > threshold
        ? 'Worker heartbeat overdue'
        : health.lastError
          ? 'Worker error'
          : pending
            ? 'Worker running with pending work'
            : 'Worker healthy'
  return {
    state,
    pending,
    failed,
    oldest: oldest?.createdAt.toISOString() ?? null,
    lastCompletedAt: health?.lastCompletedAt?.toISOString() ?? null,
    error: health?.lastError ?? null,
  }
}
export async function getDiscoveredDevices(input: {
  kind?: string
  q?: string
  linked?: string
  page?: string
  assetq?: string
}) {
  const viewer = await authorizeInventoryRead()
  const kind: 'ACI' | 'LEGACY' = input.kind === 'LEGACY' ? 'LEGACY' : 'ACI'
  const q = (input.q ?? '').trim().slice(0, 128)
  const assetq = (input.assetq ?? '').trim().slice(0, 128)
  const page = Math.min(100000, Math.max(1, Math.floor(Number(input.page) || 1)))
  const relation =
    input.linked === 'yes' ? { isNot: null } : input.linked === 'no' ? { is: null } : undefined
  const nodeWhere = {
    ...(relation ? { inventorySource: relation } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { serial: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }
  const legacyWhere = {
    ...(relation ? { inventorySource: relation } : {}),
    ...(q
      ? {
          OR: [
            { hostname: { contains: q, mode: 'insensitive' as const } },
            { serialNumber: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }
  const include = {
    inventorySource: {
      select: {
        id: true,
        deviceId: true,
        deviceStackId: true,
        conflictReason: true,
        acceptedRevision: true,
      },
    },
  }
  const [nodes, legacy, total, stacks, health] = await Promise.all([
    kind === 'ACI'
      ? prisma.nodeSnapshot.findMany({
          where: nodeWhere,
          include,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * 25,
          take: 25,
        })
      : [],
    kind === 'LEGACY'
      ? prisma.legacyDevice.findMany({
          where: legacyWhere,
          include,
          orderBy: [{ hostname: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * 25,
          take: 25,
        })
      : [],
    kind === 'ACI'
      ? prisma.nodeSnapshot.count({ where: nodeWhere })
      : prisma.legacyDevice.count({ where: legacyWhere }),
    prisma.deviceStack.findMany({
      where: assetq ? { name: { contains: assetq, mode: 'insensitive' } } : {},
      take: 200,
      select: {
        id: true,
        name: true,
        devices: { select: { id: true } },
        source: { select: { id: true, sourceLabel: true } },
      },
      orderBy: { name: 'asc' },
    }),
    getWorkerHealth(),
  ])
  const observations = [
    ...nodes.map((n) => ({
      id: n.id,
      observation: nodeObservation(n),
      key: sourceKey(n.apicHostId, n.dn),
      link: n.inventorySource,
      revision: n.inventoryRevision,
      vendor: 'Cisco',
      reserved: false,
    })),
    ...legacy.map((n) => ({
      id: n.id,
      observation: legacyObservation(n),
      key: sourceKey(n.siteKey, n.hostnameKey),
      link: n.inventorySource,
      revision: n.inventoryRevision,
      vendor: n.vendor ?? '',
      reserved: false,
    })),
  ]
  const reservations = await prisma.inventorySource.findMany({
    where: { kind, sourceKey: { in: observations.map((row) => row.key) } },
    select: { ...include.inventorySource.select, sourceKey: true },
  })
  for (const row of observations)
    if (!row.link) {
      row.link = reservations.find((link) => link.sourceKey === row.key) ?? null
      row.reserved = Boolean(row.link)
    }
  const serials = observations
    .map((row) => serialKey(row.observation.serial))
    .filter((key): key is string => Boolean(key))
  const matches = serials.length
    ? await prisma.$queryRaw<{ serial: string; count: number; id: string }[]>(Prisma.sql`
    SELECT lower(trim("serialNumber")) AS serial, count(*)::int AS count, min(id) AS id
    FROM device WHERE lower(trim("serialNumber")) IN (${Prisma.join(serials)})
    GROUP BY lower(trim("serialNumber"))`)
    : []
  const deviceSelect = {
    id: true,
    name: true,
    serialNumber: true,
    model: true,
    version: true,
    deviceStackId: true,
    source: { select: { id: true, sourceLabel: true } },
  } as const
  const [options, matchedDevices] = await Promise.all([
    prisma.device.findMany({
      where: assetq
        ? {
            OR: [
              { name: { contains: assetq, mode: 'insensitive' } },
              { serialNumber: { contains: assetq, mode: 'insensitive' } },
            ],
          }
        : {},
      select: deviceSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 200,
    }),
    prisma.device.findMany({
      where: { id: { in: matches.filter((match) => match.count === 1).map((match) => match.id) } },
      select: deviceSelect,
    }),
  ])
  const devices = [
    ...new Map([...options, ...matchedDevices].map((device) => [device.id, device])).values(),
  ]
  return {
    kind,
    q,
    assetq,
    linked: input.linked ?? '',
    page,
    total,
    devices,
    stacks,
    health,
    admin: viewer.role === 'admin',
    rows: observations.map((row) => ({
      id: row.id,
      reviewToken: observationReviewToken(row.observation),
      ...row.observation,
      vendor: row.vendor,
      link: row.link
        ? {
            id: row.link.id,
            deviceId: row.link.deviceId,
            stackId: row.link.deviceStackId,
            conflict: row.link.conflictReason,
          }
        : null,
      reserved: row.reserved,
      pending: row.link && !row.reserved ? row.link.acceptedRevision < row.revision : false,
      matchCount:
        matches.find((match) => match.serial === serialKey(row.observation.serial))?.count ?? 0,
      matchId:
        matches.find(
          (match) => match.serial === serialKey(row.observation.serial) && match.count === 1,
        )?.id ?? null,
    })),
  }
}
export type DiscoveryData = Awaited<ReturnType<typeof getDiscoveredDevices>>
export async function getTargetSource(deviceId: string) {
  await authorizeInventoryRead()
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { deviceStackId: true },
  })
  return prisma.inventorySource.findMany({
    where: {
      OR: [
        { deviceId },
        ...(device?.deviceStackId ? [{ deviceStackId: device.deviceStackId }] : []),
      ],
    },
    include: {
      nodeSnapshot: { select: { present: true, lastSeenAt: true, inventoryRevision: true } },
      legacyDevice: { select: { lastSeenAt: true, inventoryRevision: true } },
      deviceStack: true,
    },
  })
}
