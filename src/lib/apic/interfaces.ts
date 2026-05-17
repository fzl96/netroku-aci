import { apicFetch } from './client'

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

// ACI rmonIfIn attribute names (Cisco APIC MIM). The cumulative counters are
// un-prefixed: `octets`, `pkts`, `errors`, `discards`.
interface RmonIfInAttrs {
  octets?: string
  pkts?: string
  ucastPkts?: string
  multicastPkts?: string
  broadcastPkts?: string
  errors?: string
  discards?: string
  unknownProtos?: string
}

interface RmonIfOutAttrs {
  octets?: string
  pkts?: string
  ucastPkts?: string
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
      rxPkts: toBigInt(rmonIn.pkts),
      rxErrors: toBigInt(rmonIn.errors),
      rxDiscards: toBigInt(rmonIn.discards),
      rxCrcErrors: toBigInt(dot3.fCSErrors),
      rxAlignErrors: dot3.alignmentErrors !== undefined
        ? toBigInt(dot3.alignmentErrors)
        : alignFallback,
      txBytes: toBigInt(rmonOut.octets),
      txPkts: toBigInt(rmonOut.pkts),
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
