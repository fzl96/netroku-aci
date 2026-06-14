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
