import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getApicHosts } from '@/actions/apic-hosts'
import { EndpointsClient } from './EndpointsClient'
import type { Endpoint } from '@prisma/client'

const VALID_PAGE_SIZES = [10, 50, 100, 1000] as const
type PageSizeValue = typeof VALID_PAGE_SIZES[number] | 'all'

function parsePageSize(param: string | undefined): PageSizeValue {
  if (param === 'all') return 'all'
  const n = parseInt(param ?? '50', 10)
  return (VALID_PAGE_SIZES as readonly number[]).includes(n) ? (n as PageSizeValue) : 50
}

export default async function EndpointsPage({
  searchParams,
}: {
  searchParams: Promise<{ apic?: string; query?: string; page?: string; pageSize?: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/signin')

  const { apic, query, page: pageParam, pageSize: pageSizeParam } = await searchParams
  const apicHosts = await getApicHosts()

  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const pageSize = parsePageSize(pageSizeParam)

  let endpoints: Endpoint[] = []
  let total = 0
  let activeTotal = 0
  let historicalTotal = 0

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

    const skip = pageSize === 'all' ? 0 : (page - 1) * pageSize
    const take = pageSize === 'all' ? undefined : pageSize

    ;[endpoints, total] = await Promise.all([
      prisma.endpoint.findMany({ where, orderBy: { lastSeenAt: 'desc' }, skip, take }),
      prisma.endpoint.count({ where }),
    ])

    ;[activeTotal, historicalTotal] = await Promise.all([
      prisma.endpoint.count({ where: { apicHostId: apic, isActive: true } }),
      prisma.endpoint.count({ where: { apicHostId: apic, isActive: false } }),
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
      pageSize={pageSize}
      activeTotal={activeTotal}
      historicalTotal={historicalTotal}
    />
  )
}
