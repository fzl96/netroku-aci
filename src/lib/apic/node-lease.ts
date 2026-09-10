import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
export class NodeResyncBusyError extends Error {
  constructor() {
    super('Node discovery is already running for this host. Try again when it finishes.')
    this.name = 'NodeResyncBusyError'
  }
}
const LEASE_MS = 120000
export async function acquireNodeLease(hostId: string) {
  const token = crypto.randomUUID()
  const rows = await prisma.$queryRaw<
    { id: string }[]
  >`UPDATE apic_host SET "nodeLeaseToken" = ${token},
    "nodeLeaseExpiresAt" = ${new Date(Date.now() + LEASE_MS)}
    WHERE id = ${hostId} AND ("nodeLeaseExpiresAt" IS NULL OR "nodeLeaseExpiresAt" < (now() AT TIME ZONE 'UTC')) RETURNING id`
  if (!rows.length) throw new NodeResyncBusyError()
  return token
}
export async function verifyNodeLease(tx: Prisma.TransactionClient, hostId: string, token: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM apic_host
    WHERE id = ${hostId} AND "nodeLeaseToken" = ${token} AND "nodeLeaseExpiresAt" > (now() AT TIME ZONE 'UTC') FOR UPDATE`
  if (!rows.length)
    throw new Error('Node discovery lease expired or was replaced; results were discarded.')
}
export async function renewNodeLease(hostId: string, token: string) {
  await prisma.apicHost.updateMany({
    where: { id: hostId, nodeLeaseToken: token, nodeLeaseExpiresAt: { gt: new Date() } },
    data: { nodeLeaseExpiresAt: new Date(Date.now() + LEASE_MS) },
  })
}
export async function releaseNodeLease(hostId: string, token: string) {
  await prisma.apicHost.updateMany({
    where: { id: hostId, nodeLeaseToken: token },
    data: { nodeLeaseToken: null, nodeLeaseExpiresAt: null },
  })
}
