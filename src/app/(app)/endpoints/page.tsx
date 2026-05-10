import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getApicHosts } from '@/actions/apic-hosts'
import { EndpointsClient } from './EndpointsClient'
import type { Endpoint } from '@prisma/client'

const PAGE_SIZE = 50

export default async function EndpointsPage({
  searchParams,
}: {
  searchParams: Promise<{ apic?: string; query?: string; page?: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/signin')

  const { apic, query, page: pageParam } = await searchParams
  const apicHosts = await getApicHosts()

  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)

  let endpoints: Endpoint[] = []
  let total = 0

  if (apic && apicHosts.some(h => h.id === apic)) {
    const where = {
      apicHostId: apic,
      ...(query?.trim()
        ? {
            OR: [
              { mac: { contains: query } },
              { ip: { contains: query } },
              { vlan: { contains: query } },
              { node: { contains: query } },
              { interface: { contains: query } },
              { epgDescr: { contains: query } },
              { dn: { contains: query } },
            ],
          }
        : {}),
    }

    ;[endpoints, total] = await Promise.all([
      prisma.endpoint.findMany({
        where,
        orderBy: { lastSeenAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.endpoint.count({ where }),
    ])
  }

  return (
    <EndpointsClient
      apicHosts={apicHosts}
      endpoints={endpoints}
      selectedHostId={apic ?? ''}
      query={query ?? ''}
      page={page}
      total={total}
      pageSize={PAGE_SIZE}
    />
  )
}
