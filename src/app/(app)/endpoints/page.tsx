import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getApicHosts } from '@/actions/apic-hosts'
import { buildEndpointWhere, expandNodeOptions } from '@/lib/endpoints/query'
import {
  parseEndpointPageParams,
  type RawEndpointPageParams,
} from '@/lib/endpoints/params'
import { groupEndpointsByPort, type EndpointPortSummary } from '@/lib/endpoints/sort'
import { EndpointsClient } from './EndpointsClient'
import type { Endpoint } from '@prisma/client'

export const metadata: Metadata = {
  title: 'Endpoints',
  description: 'Browse active and historical endpoints learned by the APIC fabric.',
}

export default async function EndpointsPage({
  searchParams,
}: {
  searchParams: Promise<RawEndpointPageParams>
}) {
  const session = await getSession()
  if (!session) redirect('/signin')

  const {
    hostId: apic,
    view,
    query,
    page,
    pageSize,
    vlans: filterVlan,
    nodes: filterNode,
    interfaces: filterIface,
    statuses: filterStatus,
  } = parseEndpointPageParams(await searchParams)
  const apicHosts = await getApicHosts()

  if (!apic && apicHosts.length > 0) redirect(`/endpoints?apic=${apicHosts[0].id}`)

  let endpoints: Endpoint[] = []
  let ports: EndpointPortSummary[] = []
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
      iface: view === 'endpoint' ? filterIface : [],
      status: filterStatus,
    })

    const skip = pageSize === 'all' ? 0 : (page - 1) * pageSize
    const take = pageSize === 'all' ? undefined : pageSize

    const hostWhere = { apicHostId: apic }

    let fetchedDataPromise: Promise<[Endpoint[], EndpointPortSummary[], number]>
    if (view === 'endpoint') {
      fetchedDataPromise = Promise.all([
        prisma.endpoint.findMany({ where, orderBy: { lastSeenAt: 'desc' }, skip, take }),
        prisma.endpoint.count({ where }),
      ]).then(([eps, cnt]) => [eps, [], cnt])
    } else {
      fetchedDataPromise = prisma.endpoint.findMany({ where }).then(rows => {
        const grouped = groupEndpointsByPort(rows)
        const sliced = take === undefined ? grouped : grouped.slice(skip, skip + take)
        return [[], sliced, grouped.length]
      })
    }

    let nodeRows: { node: string }[] = []
    ;[
      [endpoints, ports, total],
      [activeTotal, historicalTotal],
      vlans, nodeRows, ifaces,
    ] = await Promise.all([
      fetchedDataPromise,
      Promise.all([
        prisma.endpoint.count({ where: { ...hostWhere, isActive: true } }),
        prisma.endpoint.count({ where: { ...hostWhere, isActive: false } }),
      ]),
      prisma.endpoint.findMany({ where: hostWhere, select: { vlan: true }, distinct: ['vlan'], orderBy: { vlan: 'asc' } })
        .then(r => r.map(x => x.vlan).filter(Boolean) as string[]),
      prisma.endpoint.findMany({ where: hostWhere, select: { node: true }, distinct: ['node'] }),
      prisma.endpoint.findMany({ where: hostWhere, select: { interface: true }, distinct: ['interface'], orderBy: { interface: 'asc' } })
        .then(r => r.map(x => x.interface).filter(Boolean) as string[]),
    ])

    nodes = expandNodeOptions(nodeRows.map(r => r.node).filter(Boolean))
  }

  return (
    <EndpointsClient
      view={view}
      endpoints={endpoints}
      ports={ports}
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
