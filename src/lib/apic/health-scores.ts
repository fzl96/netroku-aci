import { prisma } from '@/lib/prisma'
import { apicFetch, apicLogin } from './client'

export type HealthScope = 'fabric' | 'pod' | 'node' | 'tenant'

export interface ParsedHealthRow {
  dn: string
  scope: HealthScope
  name: string
  node: string | null
  score: number
  twScore: number | null
  prevScore: number | null
  maxSeverity: string | null
}

interface HealthInstAttrs {
  cur?: string
  twScore?: string
  prev?: string
  maxSev?: string
}

interface MoWithHealth {
  attributes: Record<string, string>
  children?: Array<{ healthInst?: { attributes: HealthInstAttrs } }>
}

export interface FabricHealthNode {
  fabricHealthTotal?: { attributes: { dn: string; cur?: string; twScore?: string } }
}
export interface TopSystemHealthNode {
  topSystem?: MoWithHealth
}
export interface TenantHealthNode {
  fvTenant?: MoWithHealth
}

function toInt(value: string | undefined): number {
  if (value === undefined) return 0
  const n = parseInt(value, 10)
  return Number.isNaN(n) ? 0 : n
}

function toIntOrNull(value: string | undefined): number | null {
  if (value === undefined) return null
  const n = parseInt(value, 10)
  return Number.isNaN(n) ? null : n
}

function findHealthInst(mo: MoWithHealth): HealthInstAttrs | null {
  const child = mo.children?.find(c => c.healthInst)?.healthInst
  return child?.attributes ?? null
}

const POD_RE = /topology\/pod-(\d+)\b/

export function parseFabricHealthRows(imdata: FabricHealthNode[]): ParsedHealthRow[] {
  const rows: ParsedHealthRow[] = []
  for (const item of imdata) {
    const mo = item.fabricHealthTotal
    if (!mo) continue
    const a = mo.attributes
    const dn = a.dn.replace(/\/health$/, '')
    const podMatch = POD_RE.exec(dn)
    const scope: HealthScope = podMatch ? 'pod' : 'fabric'
    rows.push({
      dn,
      scope,
      name: scope === 'pod' ? `Pod ${podMatch![1]}` : 'Fabric',
      node: null,
      score: toInt(a.cur),
      twScore: toIntOrNull(a.twScore),
      prevScore: null,
      maxSeverity: null,
    })
  }
  return rows
}

export function parseNodeHealthRows(imdata: TopSystemHealthNode[]): ParsedHealthRow[] {
  const rows: ParsedHealthRow[] = []
  for (const item of imdata) {
    const mo = item.topSystem
    if (!mo) continue
    const health = findHealthInst(mo)
    if (!health) continue
    const a = mo.attributes
    rows.push({
      dn: a.dn,
      scope: 'node',
      name: a.name && a.name.length > 0 ? a.name : `Node ${a.id}`,
      node: a.id ?? null,
      score: toInt(health.cur),
      twScore: toIntOrNull(health.twScore),
      prevScore: toIntOrNull(health.prev),
      maxSeverity: health.maxSev ?? null,
    })
  }
  return rows
}

export function parseTenantHealthRows(imdata: TenantHealthNode[]): ParsedHealthRow[] {
  const rows: ParsedHealthRow[] = []
  for (const item of imdata) {
    const mo = item.fvTenant
    if (!mo) continue
    const health = findHealthInst(mo)
    if (!health) continue
    const a = mo.attributes
    rows.push({
      dn: a.dn,
      scope: 'tenant',
      name: a.name ?? '',
      node: null,
      score: toInt(health.cur),
      twScore: toIntOrNull(health.twScore),
      prevScore: toIntOrNull(health.prev),
      maxSeverity: health.maxSev ?? null,
    })
  }
  return rows
}

export function parseHealthRows(sources: {
  fabric: FabricHealthNode[]
  node: TopSystemHealthNode[]
  tenant: TenantHealthNode[]
}): ParsedHealthRow[] {
  return [
    ...parseFabricHealthRows(sources.fabric),
    ...parseNodeHealthRows(sources.node),
    ...parseTenantHealthRows(sources.tenant),
  ]
}

export const GOOD_MIN = 95
export const FAIR_MIN = 80
export const DEGRADED_THRESHOLD = 90

export type HealthBand = 'good' | 'fair' | 'poor'

export function healthBand(score: number): HealthBand {
  if (score >= GOOD_MIN) return 'good'
  if (score >= FAIR_MIN) return 'fair'
  return 'poor'
}

export interface HealthSummary {
  overall: number
  worstScore: number
  degradedCount: number
}

export function summarizeHealth(rows: ParsedHealthRow[]): HealthSummary {
  const overall = rows.find(r => r.scope === 'fabric')?.score ?? 0
  const breakdown = rows.filter(r => r.scope === 'node' || r.scope === 'tenant')
  const worstScore = breakdown.length > 0
    ? Math.min(...breakdown.map(r => r.score))
    : overall
  const degradedCount = breakdown.filter(r => r.score < DEGRADED_THRESHOLD).length
  return { overall, worstScore, degradedCount }
}

async function getJson<T>(host: string, token: string, path: string): Promise<T[]> {
  const res = await apicFetch(host, path, { token })
  if (!res.ok) throw new Error(`APIC GET ${path} failed: ${res.status}`)
  const data = (await res.json()) as { imdata?: T[] }
  return data.imdata ?? []
}

export async function fetchHealthScoresFromApic(
  host: string,
  username: string,
  plaintextPassword: string,
): Promise<ParsedHealthRow[]> {
  const token = await apicLogin(host, username, plaintextPassword)
  const [fabric, node, tenant] = await Promise.all([
    getJson<FabricHealthNode>(host, token, '/api/node/class/fabricHealthTotal.json'),
    getJson<TopSystemHealthNode>(host, token, '/api/node/class/topSystem.json?rsp-subtree-include=health'),
    getJson<TenantHealthNode>(host, token, '/api/node/class/fvTenant.json?rsp-subtree-include=health'),
  ])
  return parseHealthRows({ fabric, node, tenant })
}

const HEALTH_CHUNK_SIZE = 100

export interface ResyncHealthArgs {
  apicHostId: string
  host: string
  username: string
  password: string
}

export interface ResyncHealthResult {
  synced: number
  total: number
  overall: number
}

/**
 * Fetch health scores from APIC and persist them for one host.
 * Phase 1 upserts HealthScoreSnapshot rows; phase 2 marks vanished objects
 * `present=false`; phase 3 records one HealthScoreSample for the overall trend.
 */
export async function resyncHealthScores(args: ResyncHealthArgs): Promise<ResyncHealthResult> {
  const { apicHostId, host, username, password } = args

  const rows = await fetchHealthScoresFromApic(host, username, password)

  const deduped = new Map<string, ParsedHealthRow>()
  for (const row of rows) if (row.dn) deduped.set(row.dn, row)
  const uniqueRows = Array.from(deduped.values())
  const now = new Date()

  // Phase 1: upsert snapshots (chunked).
  for (let i = 0; i < uniqueRows.length; i += HEALTH_CHUNK_SIZE) {
    const chunk = uniqueRows.slice(i, i + HEALTH_CHUNK_SIZE)
    await prisma.$transaction(
      chunk.map(row =>
        prisma.healthScoreSnapshot.upsert({
          where: { apicHostId_dn: { apicHostId, dn: row.dn } },
          update: {
            scope: row.scope,
            name: row.name,
            node: row.node,
            score: row.score,
            twScore: row.twScore,
            prevScore: row.prevScore,
            maxSeverity: row.maxSeverity,
            present: true,
            lastSeenAt: now,
          },
          create: {
            apicHostId,
            dn: row.dn,
            scope: row.scope,
            name: row.name,
            node: row.node,
            score: row.score,
            twScore: row.twScore,
            prevScore: row.prevScore,
            maxSeverity: row.maxSeverity,
            present: true,
            firstSeenAt: now,
            lastSeenAt: now,
          },
        }),
      ),
    )
  }

  // Phase 2: mark previously-present objects that disappeared as absent.
  const currentDns = uniqueRows.map(r => r.dn)
  await prisma.healthScoreSnapshot.updateMany({
    where: { apicHostId, present: true, dn: { notIn: currentDns } },
    data: { present: false },
  })

  // Phase 3: record an overall-trend sample.
  const summary = summarizeHealth(uniqueRows)
  await prisma.healthScoreSample.create({
    data: {
      apicHostId,
      sampledAt: now,
      overall: summary.overall,
      worstScore: summary.worstScore,
      degradedCount: summary.degradedCount,
    },
  })

  await prisma.apicHost.update({
    where: { id: apicHostId },
    data: { lastHealthSyncAt: now },
  })

  const total = await prisma.healthScoreSnapshot.count({ where: { apicHostId, present: true } })
  return { synced: uniqueRows.length, total, overall: summary.overall }
}
