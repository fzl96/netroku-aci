import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { fetchEndpointsFromApic } from '@/lib/apic/endpoints'

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

  let fetched: Awaited<ReturnType<typeof fetchEndpointsFromApic>>
  try {
    fetched = await fetchEndpointsFromApic(apicHost.host, apicHost.username, plaintextPassword)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch endpoints from APIC' },
      { status: 502 },
    )
  }

  // Deduplicate by (mac, ip) — last occurrence wins for multi-path endpoints
  const deduped = new Map<string, (typeof fetched)[0]>()
  for (const row of fetched) {
    deduped.set(`${row.mac}|${row.ip}`, row)
  }
  const uniqueRows = Array.from(deduped.values())

  const now = new Date()

  // Mark all current active endpoints as inactive
  await prisma.endpoint.updateMany({
    where: { apicHostId, isActive: true },
    data: { isActive: false },
  })

  // Chunked transactional upsert
  for (let i = 0; i < uniqueRows.length; i += CHUNK_SIZE) {
    const chunk = uniqueRows.slice(i, i + CHUNK_SIZE)
    await prisma.$transaction(
      chunk.map(row =>
        prisma.endpoint.upsert({
          where: { apicHostId_mac_ip: { apicHostId, mac: row.mac, ip: row.ip } },
          update: {
            vlan: row.vlan,
            dn: row.dn,
            node: row.node,
            interface: row.interface,
            epgDescr: row.epgDescr,
            isActive: true,
            lastSeenAt: now,
          },
          create: {
            apicHostId,
            mac: row.mac,
            ip: row.ip,
            vlan: row.vlan,
            dn: row.dn,
            node: row.node,
            interface: row.interface,
            epgDescr: row.epgDescr,
            isActive: true,
            firstSeenAt: now,
            lastSeenAt: now,
          },
        }),
      ),
    )
  }

  const total = await prisma.endpoint.count({ where: { apicHostId } })

  return Response.json({ synced: uniqueRows.length, total })
}
