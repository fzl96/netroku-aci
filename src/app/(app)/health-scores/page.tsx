import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getApicHosts } from '@/actions/apic-hosts'
import { HealthScoresClient, type HealthRowProps } from './HealthScoresClient'
import { sortHealthRows } from './sort'

export const metadata: Metadata = {
  title: 'Health Scores',
  description: 'Cisco ACI fabric, node, and tenant health scores resynced from APIC, with overall trend.',
}

const VALID_PAGE_SIZES = [10, 50, 100, 1000] as const
type PageSizeValue = (typeof VALID_PAGE_SIZES)[number] | 'all'

function parsePageSize(param: string | undefined): PageSizeValue {
  if (param === 'all') return 'all'
  const n = parseInt(param ?? '50', 10)
  return (VALID_PAGE_SIZES as readonly number[]).includes(n) ? (n as PageSizeValue) : 50
}

const VALID_SCOPES = ['node', 'tenant'] as const

export default async function HealthScoresPage({
  searchParams,
}: {
  searchParams: Promise<{
    apic?: string
    query?: string
    scope?: string
    page?: string
    pageSize?: string
  }>
}) {
  const session = await getSession()
  if (!session) redirect('/signin')

  const { apic, query, scope, page: pageParam, pageSize: pageSizeParam } = await searchParams
  const apicHosts = await getApicHosts()

  const scopeFilter = (VALID_SCOPES as readonly string[]).includes(scope ?? '')
    ? (scope as string)
    : undefined
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const pageSize = parsePageSize(pageSizeParam)

  let rows: HealthRowProps[] = []
  let total = 0
  let lastSyncedAt: Date | null = null
  let fabricScore: number | null = null
  let pods: { name: string; score: number }[] = []
  let trend: { sampledAt: string; overall: number; worstScore: number }[] = []

  if (apic && apicHosts.some(h => h.id === apic)) {
    const host = await prisma.apicHost.findUnique({
      where: { id: apic },
      select: { lastHealthSyncAt: true },
    })
    lastSyncedAt = host?.lastHealthSyncAt ?? null

    const where = {
      apicHostId: apic,
      present: true,
      scope: scopeFilter ? scopeFilter : { in: ['node', 'tenant'] },
      ...(query?.trim()
        ? {
            OR: [
              { name: { contains: query.trim(), mode: 'insensitive' as const } },
              { node: { contains: query.trim(), mode: 'insensitive' as const } },
              { dn: { contains: query.trim(), mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    total = await prisma.healthScoreSnapshot.count({ where })

    const records = await prisma.healthScoreSnapshot.findMany({
      where,
      ...(pageSize === 'all' ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
    })
    rows = sortHealthRows(
      records.map(r => ({
        id: r.id,
        scope: r.scope,
        name: r.name,
        node: r.node,
        score: r.score,
        maxSeverity: r.maxSeverity,
        lastSeenAt: r.lastSeenAt.toISOString(),
      })),
    )

    const headline = await prisma.healthScoreSnapshot.findMany({
      where: { apicHostId: apic, present: true, scope: { in: ['fabric', 'pod'] } },
      select: { scope: true, name: true, score: true },
    })
    fabricScore = headline.find(h => h.scope === 'fabric')?.score ?? null
    pods = headline
      .filter(h => h.scope === 'pod')
      .map(h => ({ name: h.name, score: h.score }))

    const samples = await prisma.healthScoreSample.findMany({
      where: { apicHostId: apic },
      orderBy: { sampledAt: 'desc' },
      take: 100,
      select: { sampledAt: true, overall: true, worstScore: true },
    })
    trend = samples
      .reverse()
      .map(s => ({
        sampledAt: s.sampledAt.toISOString(),
        overall: s.overall,
        worstScore: s.worstScore,
      }))
  }

  return (
    <HealthScoresClient
      selectedApic={apic ?? null}
      query={query ?? ''}
      scope={scopeFilter ?? null}
      rows={rows}
      total={total}
      page={page}
      pageSize={pageSize}
      lastSyncedAt={lastSyncedAt ? lastSyncedAt.toISOString() : null}
      fabricScore={fabricScore}
      pods={pods}
      trend={trend}
    />
  )
}
