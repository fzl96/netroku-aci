import { prisma } from '@/lib/prisma'
import { apicLogin } from './client'
import { apicFetch } from './client'

export interface FaultInstAttrs {
  dn: string
  code: string
  severity: string
  domain?: string
  type?: string
  cause?: string
  descr?: string
  ack?: string
  created?: string
  lastTransition?: string
}

export interface FaultInstNode {
  faultInst?: { attributes: FaultInstAttrs }
}

export interface ApicFaultRow {
  dn: string
  code: string
  severity: string
  domain: string
  type: string
  cause: string
  affectedDn: string
  node: string | null
  descr: string
  ack: boolean
  created: Date | null
  lastTransition: Date | null
}

const NODE_RE = /topology\/pod-\d+\/node-(\d+)\b/

function parseDate(value: string | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Strip the trailing `/fault-Fxxxx` RN to get the affected object's DN. */
function affectedDnFrom(dn: string): string {
  return dn.replace(/\/fault-[^/]+$/, '')
}

export function parseFaultRows(imdata: FaultInstNode[]): ApicFaultRow[] {
  const rows: ApicFaultRow[] = []
  for (const item of imdata) {
    const fault = item.faultInst
    if (!fault) continue
    const a = fault.attributes
    const affectedDn = affectedDnFrom(a.dn)
    const nodeMatch = NODE_RE.exec(affectedDn)
    rows.push({
      dn: a.dn,
      code: a.code,
      severity: a.severity,
      domain: a.domain ?? '',
      type: a.type ?? '',
      cause: a.cause ?? '',
      affectedDn,
      node: nodeMatch ? nodeMatch[1] : null,
      descr: a.descr ?? '',
      ack: a.ack === 'yes',
      created: parseDate(a.created),
      lastTransition: parseDate(a.lastTransition),
    })
  }
  return rows
}

export interface FaultCounts {
  critical: number
  major: number
  minor: number
  warning: number
  total: number
}

export function tallyFaultCounts(rows: Array<{ severity: string }>): FaultCounts {
  const counts: FaultCounts = { critical: 0, major: 0, minor: 0, warning: 0, total: 0 }
  for (const row of rows) {
    counts.total += 1
    if (row.severity === 'critical') counts.critical += 1
    else if (row.severity === 'major') counts.major += 1
    else if (row.severity === 'minor') counts.minor += 1
    else if (row.severity === 'warning') counts.warning += 1
  }
  return counts
}

/** Previously-active fault DNs that are absent from the current resync = cleared. */
export function selectClearedDns(previousActiveDns: string[], currentDns: Set<string>): string[] {
  return previousActiveDns.filter(dn => !currentDns.has(dn))
}

export async function fetchFaultsFromApic(
  host: string,
  username: string,
  plaintextPassword: string,
): Promise<ApicFaultRow[]> {
  const token = await apicLogin(host, username, plaintextPassword)
  const path = '/api/node/class/faultInst.json'
  const res = await apicFetch(host, path, { token })
  if (!res.ok) throw new Error(`APIC GET ${path} failed: ${res.status}`)
  const data = (await res.json()) as { imdata?: FaultInstNode[] }
  return parseFaultRows(data.imdata ?? [])
}

const FAULTS_CHUNK_SIZE = 100

export interface ResyncFaultsArgs {
  apicHostId: string
  host: string
  username: string
  password: string
}

export interface ResyncFaultsResult extends FaultCounts {
  synced: number
  total: number
}

/**
 * Fetch active faults from APIC and persist them for one host.
 * Phase 1 upserts active FaultSnapshot rows; phase 2 flips previously-active
 * faults that vanished to `cleared`; phase 3 records a FaultCountSample.
 */
export async function resyncFaults(args: ResyncFaultsArgs): Promise<ResyncFaultsResult> {
  const { apicHostId, host, username, password } = args

  const rows = await fetchFaultsFromApic(host, username, password)

  const deduped = new Map<string, ApicFaultRow>()
  for (const row of rows) if (row.dn) deduped.set(row.dn, row)
  const uniqueRows = Array.from(deduped.values())
  const now = new Date()

  // Phase 1: upsert active faults (chunked so a huge fabric doesn't trip SQLite).
  for (let i = 0; i < uniqueRows.length; i += FAULTS_CHUNK_SIZE) {
    const chunk = uniqueRows.slice(i, i + FAULTS_CHUNK_SIZE)
    await prisma.$transaction(
      chunk.map(row =>
        prisma.faultSnapshot.upsert({
          where: { apicHostId_dn: { apicHostId, dn: row.dn } },
          update: {
            code: row.code,
            severity: row.severity,
            domain: row.domain,
            type: row.type,
            cause: row.cause,
            affectedDn: row.affectedDn,
            node: row.node,
            descr: row.descr,
            ack: row.ack,
            created: row.created,
            lastTransition: row.lastTransition,
            lifecycle: 'active',
            clearedAt: null,
            lastSeenAt: now,
          },
          create: {
            apicHostId,
            dn: row.dn,
            code: row.code,
            severity: row.severity,
            domain: row.domain,
            type: row.type,
            cause: row.cause,
            affectedDn: row.affectedDn,
            node: row.node,
            descr: row.descr,
            ack: row.ack,
            created: row.created,
            lastTransition: row.lastTransition,
            lifecycle: 'active',
            firstSeenAt: now,
            lastSeenAt: now,
          },
        }),
      ),
    )
  }

  // Phase 2: flip previously-active faults that disappeared to cleared.
  const previouslyActive = await prisma.faultSnapshot.findMany({
    where: { apicHostId, lifecycle: 'active' },
    select: { dn: true },
  })
  const currentDns = new Set(uniqueRows.map(r => r.dn))
  const clearedDns = selectClearedDns(previouslyActive.map(f => f.dn), currentDns)
  if (clearedDns.length > 0) {
    await prisma.faultSnapshot.updateMany({
      where: { apicHostId, dn: { in: clearedDns } },
      data: { lifecycle: 'cleared', clearedAt: now },
    })
  }

  // Phase 3: record a severity-count sample for the trend.
  const counts = tallyFaultCounts(uniqueRows)
  await prisma.faultCountSample.create({
    data: { apicHostId, sampledAt: now, ...counts },
  })

  await prisma.apicHost.update({
    where: { id: apicHostId },
    data: { lastFaultSyncAt: now },
  })

  const total = await prisma.faultSnapshot.count({ where: { apicHostId, lifecycle: 'active' } })
  return { synced: uniqueRows.length, ...counts, total }
}
