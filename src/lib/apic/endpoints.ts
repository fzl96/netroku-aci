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

interface FvRsCEpToPathEpAttrs {
  tDn: string
}

interface FvCEpChild {
  fvIp?: { attributes: FvIpAttrs }
  fvRsCEpToPathEp?: { attributes: FvRsCEpToPathEpAttrs }
}

interface FvAEPgAttrs {
  dn: string
  descr: string
}

// vPC endpoints live on a protection path spanning both leaves, e.g.
// topology/pod-1/protpaths-3113-3114/pathep-[<vpc-ipg>]. Single-homed endpoints
// use topology/pod-1/paths-<node>/pathep-[<port>]. Check protpaths first because
// a non-anchored "paths-" also appears inside "protpaths-".
const PROTPATH_RE = /\/protpaths-(\d+)-(\d+)\/pathep-\[([^\]]+)\]/
const PATH_RE = /\/paths-(\d+)\/pathep-\[([^\]]+)\]/

/**
 * Resolve a fabric path DN to its node(s) and interface. For a vPC protection
 * path both member nodes are returned as an ascending `"<lo>-<hi>"` pair so the
 * placement is stable across resyncs (the per-leaf `fabricPathDn` alternates
 * between the two members and would otherwise look like a move every poll).
 */
export function parsePathDn(pathDn: string): { node: string; iface: string } {
  const vpc = PROTPATH_RE.exec(pathDn)
  if (vpc) {
    const [lo, hi] = [Number(vpc[1]), Number(vpc[2])].sort((a, b) => a - b)
    return { node: `${lo}-${hi}`, iface: vpc[3] }
  }
  const single = PATH_RE.exec(pathDn)
  if (single) return { node: single[1], iface: single[2] }
  return { node: '', iface: '' }
}

/**
 * Pick the authoritative path DN for an endpoint. Prefer the `fvRsCEpToPathEp`
 * relation's `tDn` (the protection path for a vPC, which names both leaves);
 * among multiple relations prefer a `protpaths-` one. Fall back to the
 * single-leaf `fabricPathDn` when no relation child is present.
 */
function pathDnForEndpoint(attrs: FvCEpAttrs, children: FvCEpChild[]): string {
  const tDns = children
    .map(child => child.fvRsCEpToPathEp?.attributes.tDn)
    .filter((tDn): tDn is string => Boolean(tDn))
  return tDns.find(tDn => tDn.includes('/protpaths-')) ?? tDns[0] ?? attrs.fabricPathDn
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

  // Fetch endpoints (with IP children and the path relation that names both vPC
  // leaves) and EPGs in parallel.
  const [epRaw, epgRaw] = await Promise.all([
    apicGet(
      host,
      token,
      '/api/node/class/fvCEp.json?rsp-subtree=children&rsp-subtree-class=fvIp,fvRsCEpToPathEp',
    ),
    apicGet(host, token, '/api/node/class/fvAEPg.json'),
  ])

  return parseEndpointRows(epRaw, epgRaw)
}

/**
 * Transform raw `fvCEp` (with `fvIp`/`fvRsCEpToPathEp` children) and `fvAEPg`
 * imdata into flat endpoint rows. Pure — no network — so the path/EPG parsing is
 * unit-testable. One row per (endpoint, IP); endpoints with no usable IP yield a
 * single MAC-only row.
 */
export function parseEndpointRows(epRaw: unknown[], epgRaw: unknown[]): ApicEndpointRow[] {
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
    const ep = (item as { fvCEp?: { attributes: FvCEpAttrs; children?: FvCEpChild[] } }).fvCEp
    if (!ep) continue

    const children = ep.children ?? []
    const { mac, encap, dn } = ep.attributes
    const { node, iface } = parsePathDn(pathDnForEndpoint(ep.attributes, children))
    const vlan = encap
    const epgDescr = epgDescrForDn(dn)

    // Collect IP addresses from children
    const ips: string[] = []
    for (const child of children) {
      const addr = child.fvIp?.attributes?.addr
      if (addr && addr !== '0.0.0.0') ips.push(addr)
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
const ENDPOINT_ADVISORY_LOCK_NAMESPACE = 20_260_619

/** Thrown when a resync is requested for a host that already has one running. */
export class EndpointResyncInProgressError extends Error {
  constructor(apicHostId: string) {
    super(`A resync is already in progress for host ${apicHostId}`)
    this.name = 'EndpointResyncInProgressError'
  }
}

type EndpointPlanDelegate = Pick<typeof prisma.endpoint, 'updateMany' | 'update' | 'create'>
type EndpointResyncDelegate = Pick<typeof prisma.endpoint, 'findMany' | 'count' | 'updateMany' | 'update' | 'create'>

interface EndpointMutationClient {
  endpoint: EndpointPlanDelegate
}

interface EndpointResyncMutationClient {
  endpoint: EndpointResyncDelegate
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>
}

export interface EndpointTransactionClient {
  $transaction<T>(
    fn: (tx: EndpointMutationClient) => Promise<T>,
    options?: { timeout?: number },
  ): Promise<T>
}

export interface EndpointResyncWriteClient {
  $transaction<T>(
    fn: (tx: EndpointResyncMutationClient) => Promise<T>,
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
 * place; endpoints absent from the fetch are marked inactive. The database reconcile
 * is serialized per host via a Postgres advisory transaction lock and throws
 * EndpointResyncInProgressError if one is already running. The active-row read,
 * plan application, and count all happen in one Postgres transaction, so moved
 * endpoints cannot be left with zero active rows by a mid-run failure. Returns
 * unique rows synced and the host's total count.
 */
export async function resyncEndpoints(
  args: ResyncEndpointsArgs,
): Promise<{ synced: number; total: number }> {
  const { apicHostId, host, username, password } = args

  const fetched = await fetchEndpointsFromApic(host, username, password)

  // Deduplicate by (mac, ip) — last occurrence wins for multi-path endpoints
  const deduped = new Map<string, (typeof fetched)[number]>()
  for (const row of fetched) {
    deduped.set(`${row.mac}|${row.ip}`, row)
  }
  const uniqueRows = Array.from(deduped.values())

  const now = new Date()
  const { total } = await reconcileFetchedEndpoints(prisma, apicHostId, uniqueRows, now)

  return { synced: uniqueRows.length, total }
}

export async function reconcileFetchedEndpoints(
  db: EndpointResyncWriteClient,
  apicHostId: string,
  uniqueRows: ApicEndpointRow[],
  now: Date,
): Promise<{ total: number }> {
  return db.$transaction(async tx => {
    const acquired = await tryAcquireEndpointResyncAdvisoryLock(tx, apicHostId)
    if (!acquired) {
      throw new EndpointResyncInProgressError(apicHostId)
    }

    const activeRows = (await tx.endpoint.findMany({
      where: { apicHostId, isActive: true },
      select: {
        id: true, mac: true, ip: true, vlan: true,
        dn: true, node: true, interface: true, epgDescr: true,
      },
    })) satisfies ActiveEndpoint[]

    const plan = planEndpointResync(activeRows, uniqueRows)
    await executeEndpointResyncPlanInTransaction(tx, apicHostId, plan, now)

    const total = await tx.endpoint.count({ where: { apicHostId } })
    return { total }
  }, { timeout: ENDPOINT_RECONCILE_TRANSACTION_TIMEOUT_MS })
}

export async function executeEndpointResyncPlan(
  db: EndpointTransactionClient,
  apicHostId: string,
  plan: EndpointResyncPlan,
  now: Date,
): Promise<void> {
  await db.$transaction(async tx => {
    await executeEndpointResyncPlanInTransaction(tx, apicHostId, plan, now)
  }, { timeout: ENDPOINT_RECONCILE_TRANSACTION_TIMEOUT_MS })
}

async function tryAcquireEndpointResyncAdvisoryLock(
  tx: Pick<EndpointResyncMutationClient, '$queryRaw'>,
  apicHostId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ acquired: boolean }>>`
    SELECT pg_try_advisory_xact_lock(${ENDPOINT_ADVISORY_LOCK_NAMESPACE}::integer, hashtext(${apicHostId})) AS acquired
  `
  return rows[0]?.acquired === true
}

async function executeEndpointResyncPlanInTransaction(
  tx: EndpointMutationClient,
  apicHostId: string,
  plan: EndpointResyncPlan,
  now: Date,
): Promise<void> {
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
}
