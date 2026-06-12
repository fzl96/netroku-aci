import { apicFetch } from './client'
import { prisma } from '@/lib/prisma'

export interface ApicInterfaceRow {
  dn: string
  node: string
  ifName: string
  usage: string
  adminSt: string
  operSt: string
  operSpeed: string
  description: string
  lastLinkStChg: Date | null

  rxBytes: bigint
  rxPkts: bigint
  rxErrors: bigint
  rxDiscards: bigint
  rxCrcErrors: bigint
  rxAlignErrors: bigint

  txBytes: bigint
  txPkts: bigint
  txErrors: bigint
  txDiscards: bigint
}

interface L1PhysIfAttrs {
  dn: string
  id: string
  adminSt: string
  usage: string
  descr: string
}

interface EthpmPhysIfAttrs {
  operSt?: string
  operSpeed?: string
  lastLinkStChg?: string
}

// ACI rmonIfIn / rmonIfOut attribute names (Cisco APIC MIM). Note: there is
// no `pkts` field — total packets is ucastPkts + nUcastPkts (nUcastPkts on
// ACI already aggregates multicast + broadcast).
interface RmonIfInAttrs {
  octets?: string
  ucastPkts?: string
  nUcastPkts?: string
  multicastPkts?: string
  broadcastPkts?: string
  errors?: string
  discards?: string
  unknownProtos?: string
}

interface RmonIfOutAttrs {
  octets?: string
  ucastPkts?: string
  nUcastPkts?: string
  multicastPkts?: string
  broadcastPkts?: string
  errors?: string
  discards?: string
}

interface RmonDot3StatsAttrs {
  fCSErrors?: string
  alignmentErrors?: string
  symbolErrors?: string
  frameTooLongs?: string
}

interface RmonEtherStatsAttrs {
  cRCAlignErrors?: string
}

const DN_RE = /topology\/pod-\d+\/node-(\d+)\/sys\/phys-\[([^\]]+)\]/

function parseDn(dn: string): { node: string; ifName: string } {
  const m = DN_RE.exec(dn)
  if (!m) return { node: '', ifName: '' }
  return { node: m[1], ifName: m[2] }
}

function toBigInt(value: string | undefined): bigint {
  if (!value) return BigInt(0)
  try {
    return BigInt(value)
  } catch {
    return BigInt(0)
  }
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

// Any APIC MO node has the shape { <className>: { attributes, children? } }.
// We walk the full subtree because rmon counters nest under ethpmPhysIf, not
// directly under l1PhysIf, and we don't want to assume a specific depth.
interface MoNode {
  [className: string]: {
    attributes: Record<string, string>
    children?: MoNode[]
  } | undefined
}

interface PhysIfNode {
  l1PhysIf?: {
    attributes: L1PhysIfAttrs
    children?: MoNode[]
  }
}

// Walk an MO subtree and collect the most-recent attributes seen for each named
// class. We pick the deepest occurrence so an ethpmPhysIf wrapper's children
// override anything on its parent, but in practice each class appears once per
// interface anyway.
function collectByClass(roots: MoNode[]): Map<string, Record<string, string>> {
  const seen = new Map<string, Record<string, string>>()
  const stack: MoNode[] = [...roots]

  while (stack.length > 0) {
    const node = stack.pop()!
    for (const className of Object.keys(node)) {
      const mo = node[className]
      if (!mo) continue
      seen.set(className, mo.attributes)
      if (mo.children?.length) stack.push(...mo.children)
    }
  }

  return seen
}

export function parseInterfaceRows(imdata: PhysIfNode[]): ApicInterfaceRow[] {
  const rows: ApicInterfaceRow[] = []

  for (const item of imdata) {
    const phys = item.l1PhysIf
    if (!phys) continue

    const { dn, adminSt, usage, descr } = phys.attributes
    const { node, ifName } = parseDn(dn)

    const attrsByClass = collectByClass(phys.children ?? [])
    const ethpm = (attrsByClass.get('ethpmPhysIf') ?? {}) as EthpmPhysIfAttrs
    const rmonIn = (attrsByClass.get('rmonIfIn') ?? {}) as RmonIfInAttrs
    const rmonOut = (attrsByClass.get('rmonIfOut') ?? {}) as RmonIfOutAttrs
    const dot3 = (attrsByClass.get('rmonDot3Stats') ?? {}) as RmonDot3StatsAttrs
    const ether = (attrsByClass.get('rmonEtherStats') ?? {}) as RmonEtherStatsAttrs

    // alignmentErrors lives on rmonDot3Stats; rmonEtherStats.cRCAlignErrors is
    // the combined CRC+align field per RFC 2819 — use it as a fallback only.
    const alignFallback = toBigInt(ether.cRCAlignErrors)

    // ACI's rmonIfIn / rmonIfOut don't expose a single `pkts` total — sum
    // unicast + non-unicast (nUcastPkts already aggregates mcast + bcast).
    const rxPkts = toBigInt(rmonIn.ucastPkts) + toBigInt(rmonIn.nUcastPkts)
    const txPkts = toBigInt(rmonOut.ucastPkts) + toBigInt(rmonOut.nUcastPkts)

    rows.push({
      dn,
      node,
      ifName,
      usage: usage ?? '',
      adminSt: adminSt ?? '',
      operSt: ethpm.operSt ?? '',
      operSpeed: ethpm.operSpeed ?? '',
      description: descr ?? '',
      lastLinkStChg: parseDate(ethpm.lastLinkStChg),
      rxBytes: toBigInt(rmonIn.octets),
      rxPkts,
      rxErrors: toBigInt(rmonIn.errors),
      rxDiscards: toBigInt(rmonIn.discards),
      rxCrcErrors: toBigInt(dot3.fCSErrors),
      rxAlignErrors: dot3.alignmentErrors !== undefined
        ? toBigInt(dot3.alignmentErrors)
        : alignFallback,
      txBytes: toBigInt(rmonOut.octets),
      txPkts,
      txErrors: toBigInt(rmonOut.errors),
      txDiscards: toBigInt(rmonOut.discards),
    })
  }

  return rows
}

/**
 * Compute counter deltas against a previous sample.
 * Returns null for any counter that decreased — that signals a switch reboot or
 * counter clear, and we don't try to guess what was lost between samples.
 */
export function computeDelta(current: bigint, previous: bigint | null): bigint | null {
  if (previous === null) return null
  if (current < previous) return null
  return current - previous
}

export async function fetchInterfacesFromApic(
  host: string,
  username: string,
  plaintextPassword: string,
): Promise<ApicInterfaceRow[]> {
  const loginRes = await apicFetch(host, '/api/aaaLogin.json', {
    method: 'POST',
    body: JSON.stringify({
      aaaUser: { attributes: { name: username, pwd: plaintextPassword } },
    }),
  })
  if (!loginRes.ok) throw new Error(`APIC authentication failed: ${loginRes.status}`)
  const loginData = (await loginRes.json()) as {
    imdata: Array<{ aaaLogin?: { attributes: { token: string } } }>
  }
  const token = loginData.imdata[0]?.aaaLogin?.attributes?.token
  if (!token) throw new Error('No token in APIC login response')

  const path
    = '/api/node/class/l1PhysIf.json'
    + '?rsp-subtree=full'
    + '&rsp-subtree-class=ethpmPhysIf,rmonIfIn,rmonIfOut,rmonDot3Stats,rmonEtherStats'

  const res = await apicFetch(host, path, { token })
  if (!res.ok) throw new Error(`APIC GET ${path} failed: ${res.status}`)
  const data = (await res.json()) as { imdata?: PhysIfNode[] }

  return parseInterfaceRows(data.imdata ?? [])
}

const INTERFACES_CHUNK_SIZE = 100

export interface ResyncInterfacesArgs {
  apicHostId: string
  host: string
  username: string
  password: string
}

/**
 * Fetch interface counters from APIC and persist them for one host.
 * Phase 1 upserts InterfaceSnapshot rows, phase 2 loads the latest prior sample
 * per interface, phase 3 inserts new samples with computed deltas.
 * Returns the number of unique interfaces synced and the host's total snapshot count.
 */
export async function resyncInterfaces(
  args: ResyncInterfacesArgs,
): Promise<{ synced: number; total: number }> {
  const { apicHostId, host, username, password } = args

  const rows = await fetchInterfacesFromApic(host, username, password)

  // Deduplicate by DN — defensive, the class query shouldn't return dupes but be paranoid
  const deduped = new Map<string, (typeof rows)[number]>()
  for (const row of rows) deduped.set(row.dn, row)
  const uniqueRows = Array.from(deduped.values()).filter(r => r.dn)

  const now = new Date()

  // Phase 1: upsert all InterfaceSnapshot rows (chunked so a huge fabric doesn't trip SQLite)
  const snapshotIds = new Map<string, string>() // dn -> snapshot.id

  for (let i = 0; i < uniqueRows.length; i += INTERFACES_CHUNK_SIZE) {
    const chunk = uniqueRows.slice(i, i + INTERFACES_CHUNK_SIZE)
    const upserted = await prisma.$transaction(
      chunk.map(row =>
        prisma.interfaceSnapshot.upsert({
          where: { apicHostId_dn: { apicHostId, dn: row.dn } },
          update: {
            node: row.node,
            ifName: row.ifName,
            usage: row.usage,
            adminSt: row.adminSt,
            operSt: row.operSt,
            operSpeed: row.operSpeed,
            description: row.description,
            lastLinkStChg: row.lastLinkStChg,
            lastSeenAt: now,
          },
          create: {
            apicHostId,
            dn: row.dn,
            node: row.node,
            ifName: row.ifName,
            usage: row.usage,
            adminSt: row.adminSt,
            operSt: row.operSt,
            operSpeed: row.operSpeed,
            description: row.description,
            lastLinkStChg: row.lastLinkStChg,
            firstSeenAt: now,
            lastSeenAt: now,
          },
          select: { id: true, dn: true },
        }),
      ),
    )
    for (const r of upserted) snapshotIds.set(r.dn, r.id)
  }

  // Phase 2: load the most recent sample for each interface in one go.
  const ids = Array.from(snapshotIds.values())
  const previousByInterface = new Map<string, {
    rxBytes: bigint; rxErrors: bigint; rxDiscards: bigint
    rxCrcErrors: bigint; rxAlignErrors: bigint
    txBytes: bigint; txErrors: bigint; txDiscards: bigint
  }>()

  if (ids.length > 0) {
    for (let i = 0; i < ids.length; i += 500) {
      const idChunk = ids.slice(i, i + 500)
      const previous = await prisma.interfaceSample.findMany({
        where: { interfaceId: { in: idChunk } },
        orderBy: { sampledAt: 'desc' },
        select: {
          interfaceId: true,
          rxBytes: true, rxErrors: true, rxDiscards: true,
          rxCrcErrors: true, rxAlignErrors: true,
          txBytes: true, txErrors: true, txDiscards: true,
        },
      })
      for (const row of previous) {
        if (previousByInterface.has(row.interfaceId)) continue
        previousByInterface.set(row.interfaceId, {
          rxBytes: row.rxBytes,
          rxErrors: row.rxErrors,
          rxDiscards: row.rxDiscards,
          rxCrcErrors: row.rxCrcErrors,
          rxAlignErrors: row.rxAlignErrors,
          txBytes: row.txBytes,
          txErrors: row.txErrors,
          txDiscards: row.txDiscards,
        })
      }
    }
  }

  // Phase 3: insert new samples (chunked).
  for (let i = 0; i < uniqueRows.length; i += INTERFACES_CHUNK_SIZE) {
    const chunk = uniqueRows.slice(i, i + INTERFACES_CHUNK_SIZE)
    await prisma.$transaction(
      chunk.map((row) => {
        const interfaceId = snapshotIds.get(row.dn)!
        const prev = previousByInterface.get(interfaceId) ?? null

        return prisma.interfaceSample.create({
          data: {
            apicHostId,
            interfaceId,
            sampledAt: now,
            adminSt: row.adminSt,
            operSt: row.operSt,
            operSpeed: row.operSpeed,
            rxBytes: row.rxBytes,
            rxPkts: row.rxPkts,
            rxErrors: row.rxErrors,
            rxDiscards: row.rxDiscards,
            rxCrcErrors: row.rxCrcErrors,
            rxAlignErrors: row.rxAlignErrors,
            txBytes: row.txBytes,
            txPkts: row.txPkts,
            txErrors: row.txErrors,
            txDiscards: row.txDiscards,
            dRxBytes: computeDelta(row.rxBytes, prev?.rxBytes ?? null),
            dRxErrors: computeDelta(row.rxErrors, prev?.rxErrors ?? null),
            dRxDiscards: computeDelta(row.rxDiscards, prev?.rxDiscards ?? null),
            dRxCrcErrors: computeDelta(row.rxCrcErrors, prev?.rxCrcErrors ?? null),
            dRxAlignErrors: computeDelta(row.rxAlignErrors, prev?.rxAlignErrors ?? null),
            dTxBytes: computeDelta(row.txBytes, prev?.txBytes ?? null),
            dTxErrors: computeDelta(row.txErrors, prev?.txErrors ?? null),
            dTxDiscards: computeDelta(row.txDiscards, prev?.txDiscards ?? null),
          },
        })
      }),
    )
  }

  await prisma.apicHost.update({
    where: { id: apicHostId },
    data: { lastInterfaceSyncAt: now },
  })

  const total = await prisma.interfaceSnapshot.count({ where: { apicHostId } })

  return { synced: uniqueRows.length, total }
}
