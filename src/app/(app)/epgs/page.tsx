import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getApicHosts } from '@/actions/apic-hosts'
import {
  buildEpgWhere,
  buildBindingWhere,
  expandNodeOptions,
  type EpgWithBindings,
} from '@/lib/epgs/query'
import { groupBindingsByPort, type EpgPortSummary } from './sort'
import { EpgsClient } from './EpgsClient'

const VALID_PAGE_SIZES = [10, 50, 100, 1000] as const
type PageSizeValue = typeof VALID_PAGE_SIZES[number] | 'all'

function parsePageSize(param: string | undefined): PageSizeValue {
  if (param === 'all') return 'all'
  const n = parseInt(param ?? '50', 10)
  return (VALID_PAGE_SIZES as readonly number[]).includes(n) ? (n as PageSizeValue) : 50
}

function parseList(param: string | undefined): string[] {
  return param ? param.split(',').map(s => s.trim()).filter(Boolean) : []
}

export default async function EpgsPage({
  searchParams,
}: {
  searchParams: Promise<{
    apic?: string; view?: string; query?: string; page?: string; pageSize?: string
    tenant?: string; ap?: string; node?: string
  }>
}) {
  const session = await getSession()
  if (!session) redirect('/signin')

  const params = await searchParams
  const apicHosts = await getApicHosts()

  const view = params.view === 'port' ? 'port' as const : 'epg' as const
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)
  const pageSize = parsePageSize(params.pageSize)
  const filterTenant = parseList(params.tenant)
  const filterAp = parseList(params.ap)
  const filterNode = parseList(params.node)

  let epgs: EpgWithBindings[] = []
  let ports: EpgPortSummary[] = []
  let total = 0
  let tenants: string[] = []
  let aps: string[] = []
  let nodeOptions: string[] = []
  let lastSyncAt: string | null = null

  const apic = params.apic
  if (apic && apicHosts.some(h => h.id === apic)) {
    const filters = {
      query: params.query,
      tenant: filterTenant,
      ap: filterAp,
    }
    const skip = pageSize === 'all' ? 0 : (page - 1) * pageSize
    const take = pageSize === 'all' ? undefined : pageSize
    const hostWhere = { apicHostId: apic }

    const [host, tenantRows, apRows, nodeRows] = await Promise.all([
      prisma.apicHost.findFirst({ where: { id: apic }, select: { lastEpgSyncAt: true } }),
      prisma.epgSnapshot.findMany({
        where: hostWhere, select: { tenant: true }, distinct: ['tenant'], orderBy: { tenant: 'asc' },
      }),
      prisma.epgSnapshot.findMany({
        where: hostWhere, select: { appProfile: true }, distinct: ['appProfile'], orderBy: { appProfile: 'asc' },
      }),
      prisma.epgPathBinding.findMany({
        where: hostWhere, select: { node: true }, distinct: ['node'],
      }),
    ])

    lastSyncAt = host?.lastEpgSyncAt?.toISOString() ?? null
    tenants = tenantRows.map(r => r.tenant).filter(Boolean)
    aps = apRows.map(r => r.appProfile).filter(Boolean)
    nodeOptions = expandNodeOptions(nodeRows.map(r => r.node).filter(Boolean))

    if (view === 'epg') {
      const where = buildEpgWhere(apic, filters)
      ;[epgs, total] = await Promise.all([
        prisma.epgSnapshot.findMany({
          where,
          orderBy: [{ tenant: 'asc' }, { name: 'asc' }],
          skip,
          take,
          include: { bindings: { orderBy: [{ node: 'asc' }, { port: 'asc' }] } },
        }),
        prisma.epgSnapshot.count({ where }),
      ])
    } else {
      const where = buildBindingWhere(apic, { ...filters, node: filterNode })
      const allRows = await prisma.epgPathBinding.findMany({
        where,
        include: {
          epg: { select: { name: true, tenant: true, appProfile: true, dn: true } },
        },
      })
      const grouped = groupBindingsByPort(allRows)
      total = grouped.length
      ports = take === undefined ? grouped : grouped.slice(skip, skip + take)
    }
  }

  return (
    <EpgsClient
      apicHosts={apicHosts}
      view={view}
      epgs={epgs}
      ports={ports}
      selectedHostId={apic ?? ''}
      query={params.query ?? ''}
      filterTenant={filterTenant}
      filterAp={filterAp}
      filterNode={filterNode}
      tenants={tenants}
      aps={aps}
      nodeOptions={nodeOptions}
      page={page}
      total={total}
      pageSize={pageSize}
      lastSyncAt={lastSyncAt}
    />
  )
}

