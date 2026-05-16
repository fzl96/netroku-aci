import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getApicHosts } from '@/actions/apic-hosts'
import { buildEndpointWhere, type EndpointStatusFilter } from '@/lib/endpoints/query'
import { EndpointsClient } from './EndpointsClient'
import type { Endpoint } from '@prisma/client'

export const metadata: Metadata = {
  title: 'Endpoints',
  description: 'Browse active and historical endpoints learned by the APIC fabric.',
}

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
  searchParams: Promise<{ apic?: string; query?: string; page?: string; pageSize?: string; vlan?: string; node?: string; iface?: string; status?: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/signin')

  const { apic, query, page: pageParam, pageSize: pageSizeParam, vlan, node, iface, status } = await searchParams
  const apicHosts = await getApicHosts()

  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const pageSize = parsePageSize(pageSizeParam)

  const filterVlan = vlan ? vlan.split(',').map(s => s.trim()).filter(Boolean) : []
  const filterNode = node ? node.split(',').map(s => s.trim()).filter(Boolean) : []
  const filterIface = iface ? iface.split(',').map(s => s.trim()).filter(Boolean) : []
  const filterStatus = status
    ? status.split(',').map(s => s.trim()).filter((s): s is EndpointStatusFilter => s === 'active' || s === 'historical')
    : []

  let endpoints: Endpoint[] = []
  let total = 0
  let activeTotal = 0
  let historicalTotal = 0
  let vlans: string[] = []
  let nodes: string[] = []
  let ifaces: string[] = []

  if (apic && apicHosts.some(h => h.id === apic)) {
    const where = buildEndpointWhere(apic, {
      query,
      vlan: filterVlan,
      node: filterNode,
      iface: filterIface,
      status: filterStatus,
    })

    const skip = pageSize === 'all' ? 0 : (page - 1) * pageSize
    const take = pageSize === 'all' ? undefined : pageSize

    const hostWhere = { apicHostId: apic }

    ;[
      [endpoints, total],
      [activeTotal, historicalTotal],
      vlans, nodes, ifaces,
    ] = await Promise.all([
      Promise.all([
        prisma.endpoint.findMany({ where, orderBy: { lastSeenAt: 'desc' }, skip, take }),
        prisma.endpoint.count({ where }),
      ]),
      Promise.all([
        prisma.endpoint.count({ where: { ...hostWhere, isActive: true } }),
        prisma.endpoint.count({ where: { ...hostWhere, isActive: false } }),
      ]),
      prisma.endpoint.findMany({ where: hostWhere, select: { vlan: true }, distinct: ['vlan'], orderBy: { vlan: 'asc' } })
        .then(r => r.map(x => x.vlan).filter(Boolean) as string[]),
      prisma.endpoint.findMany({ where: hostWhere, select: { node: true }, distinct: ['node'], orderBy: { node: 'asc' } })
        .then(r => r.map(x => x.node).filter(Boolean) as string[]),
      prisma.endpoint.findMany({ where: hostWhere, select: { interface: true }, distinct: ['interface'], orderBy: { interface: 'asc' } })
        .then(r => r.map(x => x.interface).filter(Boolean) as string[]),
    ])
  }

  return (
    <EndpointsClient
      apicHosts={apicHosts}
      endpoints={endpoints}
      selectedHostId={apic ?? ''}
      query={query ?? ''}
      filterVlan={filterVlan}
      filterNode={filterNode}
      filterIface={filterIface}
      filterStatus={filterStatus}
      vlans={vlans}
      nodes={nodes}
      ifaces={ifaces}
      page={page}
      total={total}
      pageSize={pageSize}
      activeTotal={activeTotal}
      historicalTotal={historicalTotal}
    />
  )
}
