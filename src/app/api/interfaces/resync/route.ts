import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { fetchInterfacesFromApic, computeDelta } from '@/lib/apic/interfaces'

const CHUNK_SIZE = 100

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let apicHostId: string
  try {
    ;({ apicHostId } = await request.json())
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!apicHostId) return Response.json({ error: 'apicHostId is required' }, { status: 400 })

  const apicHost = await prisma.apicHost.findFirst({
    where: { id: apicHostId, userId: session.user.id },
  })
  if (!apicHost) return Response.json({ error: 'Host not found' }, { status: 404 })

  let plaintextPassword: string
  try {
    plaintextPassword = decrypt(apicHost.password)
  } catch {
    return Response.json({ error: 'Failed to decrypt stored credentials' }, { status: 500 })
  }

  let rows: Awaited<ReturnType<typeof fetchInterfacesFromApic>>
  try {
    rows = await fetchInterfacesFromApic(apicHost.host, apicHost.username, plaintextPassword)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch interfaces from APIC' },
      { status: 502 },
    )
  }

  // Deduplicate by DN — defensive, the class query shouldn't return dupes but be paranoid
  const deduped = new Map<string, (typeof rows)[number]>()
  for (const row of rows) deduped.set(row.dn, row)
  const uniqueRows = Array.from(deduped.values()).filter(r => r.dn)

  const now = new Date()

  // Phase 1: upsert all InterfaceSnapshot rows (chunked so a huge fabric doesn't trip SQLite)
  // We need the snapshot IDs before we can write samples.
  const snapshotIds = new Map<string, string>() // dn -> snapshot.id

  for (let i = 0; i < uniqueRows.length; i += CHUNK_SIZE) {
    const chunk = uniqueRows.slice(i, i + CHUNK_SIZE)
    const upserted = await prisma.$transaction(
      chunk.map(row =>
        prisma.interfaceSnapshot.upsert({
          where: { apicHostId_dn: { apicHostId, dn: row.dn } },
          update: {
            node: row.node,
            ifName: row.ifName,
            usage: row.usage,
            adminSt: row.adminSt,
            operSt: row.operSt,
            operSpeed: row.operSpeed,
            description: row.description,
            lastLinkStChg: row.lastLinkStChg,
            lastSeenAt: now,
          },
          create: {
            apicHostId,
            dn: row.dn,
            node: row.node,
            ifName: row.ifName,
            usage: row.usage,
            adminSt: row.adminSt,
            operSt: row.operSt,
            operSpeed: row.operSpeed,
            description: row.description,
            lastLinkStChg: row.lastLinkStChg,
            firstSeenAt: now,
            lastSeenAt: now,
          },
          select: { id: true, dn: true },
        }),
      ),
    )
    for (const r of upserted) snapshotIds.set(r.dn, r.id)
  }

  // Phase 2: load the most recent sample for each interface in one go (instead of N queries).
  const ids = Array.from(snapshotIds.values())
  const previousByInterface = new Map<string, {
    rxBytes: bigint; rxErrors: bigint; rxDiscards: bigint
    rxCrcErrors: bigint; rxAlignErrors: bigint
    txBytes: bigint; txErrors: bigint; txDiscards: bigint
  }>()

  if (ids.length > 0) {
    // SQLite has variable limits, so chunk the IN list. 500 is well under the default.
    for (let i = 0; i < ids.length; i += 500) {
      const idChunk = ids.slice(i, i + 500)
      // Distinct-on-interface is awkward in SQLite, so order desc + collect first per id.
      const previous = await prisma.interfaceSample.findMany({
        where: { interfaceId: { in: idChunk } },
        orderBy: { sampledAt: 'desc' },
        select: {
          interfaceId: true,
          rxBytes: true, rxErrors: true, rxDiscards: true,
          rxCrcErrors: true, rxAlignErrors: true,
          txBytes: true, txErrors: true, txDiscards: true,
        },
      })
      for (const row of previous) {
        if (previousByInterface.has(row.interfaceId)) continue
        previousByInterface.set(row.interfaceId, {
          rxBytes: row.rxBytes,
          rxErrors: row.rxErrors,
          rxDiscards: row.rxDiscards,
          rxCrcErrors: row.rxCrcErrors,
          rxAlignErrors: row.rxAlignErrors,
          txBytes: row.txBytes,
          txErrors: row.txErrors,
          txDiscards: row.txDiscards,
        })
      }
    }
  }

  // Phase 3: insert new samples (chunked).
  for (let i = 0; i < uniqueRows.length; i += CHUNK_SIZE) {
    const chunk = uniqueRows.slice(i, i + CHUNK_SIZE)
    await prisma.$transaction(
      chunk.map((row) => {
        const interfaceId = snapshotIds.get(row.dn)!
        const prev = previousByInterface.get(interfaceId) ?? null

        return prisma.interfaceSample.create({
          data: {
            apicHostId,
            interfaceId,
            sampledAt: now,
            adminSt: row.adminSt,
            operSt: row.operSt,
            operSpeed: row.operSpeed,
            rxBytes: row.rxBytes,
            rxPkts: row.rxPkts,
            rxErrors: row.rxErrors,
            rxDiscards: row.rxDiscards,
            rxCrcErrors: row.rxCrcErrors,
            rxAlignErrors: row.rxAlignErrors,
            txBytes: row.txBytes,
            txPkts: row.txPkts,
            txErrors: row.txErrors,
            txDiscards: row.txDiscards,
            dRxBytes: computeDelta(row.rxBytes, prev?.rxBytes ?? null),
            dRxErrors: computeDelta(row.rxErrors, prev?.rxErrors ?? null),
            dRxDiscards: computeDelta(row.rxDiscards, prev?.rxDiscards ?? null),
            dRxCrcErrors: computeDelta(row.rxCrcErrors, prev?.rxCrcErrors ?? null),
            dRxAlignErrors: computeDelta(row.rxAlignErrors, prev?.rxAlignErrors ?? null),
            dTxBytes: computeDelta(row.txBytes, prev?.txBytes ?? null),
            dTxErrors: computeDelta(row.txErrors, prev?.txErrors ?? null),
            dTxDiscards: computeDelta(row.txDiscards, prev?.txDiscards ?? null),
          },
        })
      }),
    )
  }

  await prisma.apicHost.update({
    where: { id: apicHostId },
    data: { lastInterfaceSyncAt: now },
  })

  const total = await prisma.interfaceSnapshot.count({ where: { apicHostId } })

  return Response.json({ synced: uniqueRows.length, total })
}
