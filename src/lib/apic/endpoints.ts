import { apicFetch, apicLogin } from './client'
import { prisma } from '@/lib/prisma'
import { planEndpointResync, type ActiveEndpoint, type EndpointResyncPlan } from './endpoint-resync'

export interface ApicEndpointRow {
  mac: string
  ip: string
  vlan: string
  dn: string
  node: string
  interface: string
  epgDescr: string
}

interface FvCEpAttrs {
  mac: string
  encap: string
  fabricPathDn: string
  dn: string
}

interface FvIpAttrs {
  addr: string
}

interface FvAEPgAttrs {
  dn: string
  descr: string
}

const FABRIC_PATH_RE = /topology\/pod-\d+\/paths-(\d+)\/pathep-\[([^\]]+)\]/

function parsePathDn(fabricPathDn: string): { node: string; iface: string } {
  const m = FABRIC_PATH_RE.exec(fabricPathDn)
  if (!m) return { node: '', iface: '' }
  return { node: m[1], iface: m[2] }
}

async function apicGet(host: string, token: string, path: string): Promise<unknown[]> {
  const res = await apicFetch(host, path, { token })
  if (!res.ok) throw new Error(`APIC GET ${path} failed: ${res.status}`)
  const data = await res.json() as { imdata: unknown[] }
  return data.imdata ?? []
}

export async function fetchEndpointsFromApic(
  host: string,
  username: string,
  plaintextPassword: string,
): Promise<ApicEndpointRow[]> {
  const token = await apicLogin(host, username, plaintextPassword)

  // Fetch endpoints and EPGs in parallel
  const [epRaw, epgRaw] = await Promise.all([
    apicGet(host, token, '/api/node/class/fvCEp.json?rsp-subtree=children&rsp-subtree-class=fvIp'),
    apicGet(host, token, '/api/node/class/fvAEPg.json'),
  ])

  // Build EPG DN → description map
  const epgDescrMap = new Map<string, string>()
  for (const item of epgRaw) {
    const attrs = (item as { fvAEPg?: { attributes: FvAEPgAttrs } }).fvAEPg?.attributes
    if (attrs) epgDescrMap.set(attrs.dn, attrs.descr ?? '')
  }

  // Find EPG description by endpoint DN (dn looks like: uni/tn-X/ap-Y/epg-Z/cep-MAC)
  function epgDescrForDn(dn: string): string {
    // Strip the endpoint suffix to get the EPG DN: uni/tn-X/ap-Y/epg-Z
    const epgDn = dn.replace(/\/cep-[^/]+$/, '')
    return epgDescrMap.get(epgDn) ?? ''
  }

  const rows: ApicEndpointRow[] = []

  for (const item of epRaw) {
    const epObj = item as {
      fvCEp?: {
        attributes: FvCEpAttrs
        children?: Array<{ fvIp?: { attributes: FvIpAttrs } }>
      }
    }
    const ep = epObj.fvCEp
    if (!ep) continue

    const { mac, encap, fabricPathDn, dn } = ep.attributes
    const { node, iface } = parsePathDn(fabricPathDn)
    const vlan = encap
    const epgDescr = epgDescrForDn(dn)

    // Collect IP addresses from children
    const ips: string[] = []
    if (ep.children) {
      for (const child of ep.children) {
        const addr = child.fvIp?.attributes?.addr
        if (addr && addr !== '0.0.0.0') ips.push(addr)
      }
    }

    if (ips.length === 0) {
      rows.push({ mac: mac.toLowerCase(), ip: '', vlan, dn, node, interface: iface, epgDescr })
    } else {
      for (const ip of ips) {
        rows.push({ mac: mac.toLowerCase(), ip, vlan, dn, node, interface: iface, epgDescr })
      }
    }
  }

  return rows
}

const ENDPOINTS_CHUNK_SIZE = 100
const ENDPOINT_RECONCILE_TRANSACTION_TIMEOUT_MS = 30_000

/** Thrown when a resync is requested for a host that already has one running. */
export class EndpointResyncInProgressError extends Error {
  constructor(apicHostId: string) {
    super(`A resync is already in progress for host ${apicHostId}`)
    this.name = 'EndpointResyncInProgressError'
  }
}

/** A held lock older than this is treated as stale and may be reclaimed (e.g. after a crash). */
const STALE_RESYNC_MS = 10 * 60 * 1000

type EndpointDelegate = Pick<typeof prisma.endpoint, 'updateMany' | 'update' | 'create'>

interface EndpointMutationClient {
  endpoint: EndpointDelegate
}

export interface EndpointTransactionClient {
  $transaction<T>(
    fn: (tx: EndpointMutationClient) => Promise<T>,
    options?: { timeout?: number },
  ): Promise<T>
}

export interface ResyncEndpointsArgs {
  apicHostId: string
  host: string
  username: string
  password: string
}

/**
 * Fetch endpoints from APIC and reconcile them into the placement-history table
 * for one host. Unchanged endpoints have lastSeenAt bumped; moved endpoints
 * (node/interface/vlan/EPG change) get their old row marked inactive (clearedAt
 * stamped) and a new active row inserted; an epgDescr-only change is updated in
 * place; endpoints absent from the fetch are marked inactive. Serialized per host
 * via a resync lock — throws EndpointResyncInProgressError if one is already running.
 * Applies all placement-history writes in one Postgres transaction, so moved endpoints
 * cannot be left with zero active rows by a mid-run failure. Returns unique rows synced
 * and the host's total count.
 */
export async function resyncEndpoints(
  args: ResyncEndpointsArgs,
): Promise<{ synced: number; total: number }> {
  const { apicHostId, host, username, password } = args

  // Acquire a per-host lock so concurrent resyncs (manual + cron) cannot both
  // mutate the same host's placement rows and break the one-active-per-(mac,ip)
  // invariant. The timestamp doubles as an ownership token for release.
  const lockStamp = new Date()
  const staleBefore = new Date(lockStamp.getTime() - STALE_RESYNC_MS)
  const acquired = await prisma.apicHost.updateMany({
    where: {
      id: apicHostId,
      OR: [{ resyncStartedAt: null }, { resyncStartedAt: { lt: staleBefore } }],
    },
    data: { resyncStartedAt: lockStamp },
  })
  if (acquired.count === 0) {
    throw new EndpointResyncInProgressError(apicHostId)
  }

  try {
    const fetched = await fetchEndpointsFromApic(host, username, password)

    // Deduplicate by (mac, ip) — last occurrence wins for multi-path endpoints
    const deduped = new Map<string, (typeof fetched)[number]>()
    for (const row of fetched) {
      deduped.set(`${row.mac}|${row.ip}`, row)
    }
    const uniqueRows = Array.from(deduped.values())

    const now = new Date()

    // Load the current active set (at most one row per mac|ip).
    const activeRows = (await prisma.endpoint.findMany({
      where: { apicHostId, isActive: true },
      select: {
        id: true, mac: true, ip: true, vlan: true,
        dn: true, node: true, interface: true, epgDescr: true,
      },
    })) satisfies ActiveEndpoint[]

    const plan = planEndpointResync(activeRows, uniqueRows)

    await executeEndpointResyncPlan(prisma, apicHostId, plan, now)

    const total = await prisma.endpoint.count({ where: { apicHostId } })

    return { synced: uniqueRows.length, total }
  } finally {
    // Release only if we still hold the lock (guards against a stale-reclaim race).
    await prisma.apicHost
      .updateMany({
        where: { id: apicHostId, resyncStartedAt: lockStamp },
        data: { resyncStartedAt: null },
      })
      .catch(() => {})
  }
}

export async function executeEndpointResyncPlan(
  db: EndpointTransactionClient,
  apicHostId: string,
  plan: EndpointResyncPlan,
  now: Date,
): Promise<void> {
  await db.$transaction(async tx => {
    // Bump unchanged rows.
    for (let i = 0; i < plan.bumps.length; i += ENDPOINTS_CHUNK_SIZE) {
      const ids = plan.bumps.slice(i, i + ENDPOINTS_CHUNK_SIZE)
      await tx.endpoint.updateMany({
        where: { id: { in: ids } },
        data: { lastSeenAt: now },
      })
    }

    // Mark moved-away and departed rows inactive.
    for (let i = 0; i < plan.clears.length; i += ENDPOINTS_CHUNK_SIZE) {
      const ids = plan.clears.slice(i, i + ENDPOINTS_CHUNK_SIZE)
      await tx.endpoint.updateMany({
        where: { id: { in: ids } },
        data: { isActive: false, clearedAt: now },
      })
    }

    // Relabel rows whose only change is the EPG description.
    for (let i = 0; i < plan.relabels.length; i += ENDPOINTS_CHUNK_SIZE) {
      const chunk = plan.relabels.slice(i, i + ENDPOINTS_CHUNK_SIZE)
      await Promise.all(
        chunk.map(row =>
          tx.endpoint.update({
            where: { id: row.id },
            data: { epgDescr: row.epgDescr, lastSeenAt: now },
          }),
        ),
      )
    }

    // Insert new active placements (brand-new endpoints + new location of moved ones).
    for (let i = 0; i < plan.inserts.length; i += ENDPOINTS_CHUNK_SIZE) {
      const chunk = plan.inserts.slice(i, i + ENDPOINTS_CHUNK_SIZE)
      await Promise.all(
        chunk.map(row =>
          tx.endpoint.create({
            data: {
              apicHostId,
              mac: row.mac,
              ip: row.ip,
              vlan: row.vlan,
              dn: row.dn,
              node: row.node,
              interface: row.interface,
              epgDescr: row.epgDescr,
              isActive: true,
              firstSeenAt: now,
              lastSeenAt: now,
            },
          }),
        ),
      )
    }
  }, { timeout: ENDPOINT_RECONCILE_TRANSACTION_TIMEOUT_MS })
}
