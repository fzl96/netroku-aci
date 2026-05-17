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
  operSt: string
  operSpeed: string
  lastLinkStChg: string
}

interface RmonIfInAttrs {
  octetsRate?: string
  hCInOctets?: string
  hCInUcastPkts?: string
  hCInMulticastPkts?: string
  hCInBroadcastPkts?: string
  packetsRate?: string
  ucastPkts?: string
  multicastPkts?: string
  broadcastPkts?: string
  inOctets?: string
  inUcastPkts?: string
  // Counter fields we use:
  errors?: string
  discards?: string
  unknownProtos?: string
}

interface RmonIfOutAttrs {
  hCOutOctets?: string
  hCOutUcastPkts?: string
  hCOutMulticastPkts?: string
  hCOutBroadcastPkts?: string
  outOctets?: string
  outUcastPkts?: string
  // Counter fields we use:
  errors?: string
  discards?: string
}

interface RmonDot3StatsAttrs {
  fCSErrors?: string
}

interface RmonEtherStatsAttrs {
  cRCAlignErrors?: string
  alignmentErrors?: string
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

function pickBytes(a: RmonIfInAttrs): bigint {
  // APIC exposes the cumulative byte counter under hCInOctets on modern fabrics
  // and inOctets / octetsRate on older ones — fall through to whichever is present.
  return toBigInt(a.hCInOctets ?? a.inOctets ?? a.octetsRate)
}

function pickInPkts(a: RmonIfInAttrs): bigint {
  return (
    toBigInt(a.hCInUcastPkts ?? a.inUcastPkts ?? a.ucastPkts)
    + toBigInt(a.hCInMulticastPkts ?? a.multicastPkts)
    + toBigInt(a.hCInBroadcastPkts ?? a.broadcastPkts)
  )
}

function pickOutBytes(a: RmonIfOutAttrs): bigint {
  return toBigInt(a.hCOutOctets ?? a.outOctets)
}

function pickOutPkts(a: RmonIfOutAttrs): bigint {
  return (
    toBigInt(a.hCOutUcastPkts ?? a.outUcastPkts)
    + toBigInt(a.hCOutMulticastPkts)
    + toBigInt(a.hCOutBroadcastPkts)
  )
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

interface PhysIfChild {
  ethpmPhysIf?: { attributes: EthpmPhysIfAttrs }
  rmonIfIn?: { attributes: RmonIfInAttrs }
  rmonIfOut?: { attributes: RmonIfOutAttrs }
  rmonDot3Stats?: { attributes: RmonDot3StatsAttrs }
  rmonEtherStats?: { attributes: RmonEtherStatsAttrs }
}

interface PhysIfNode {
  l1PhysIf?: {
    attributes: L1PhysIfAttrs
    children?: PhysIfChild[]
  }
}

export function parseInterfaceRows(imdata: PhysIfNode[]): ApicInterfaceRow[] {
  const rows: ApicInterfaceRow[] = []

  for (const item of imdata) {
    const phys = item.l1PhysIf
    if (!phys) continue

    const { dn, adminSt, usage, descr } = phys.attributes
    const { node, ifName } = parseDn(dn)

    let operSt = ''
    let operSpeed = ''
    let lastLinkStChg: Date | null = null

    let rxBytes = BigInt(0)
    let rxPkts = BigInt(0)
    let rxErrors = BigInt(0)
    let rxDiscards = BigInt(0)
    let rxCrcErrors = BigInt(0)
    let rxAlignErrors = BigInt(0)

    let txBytes = BigInt(0)
    let txPkts = BigInt(0)
    let txErrors = BigInt(0)
    let txDiscards = BigInt(0)

    for (const child of phys.children ?? []) {
      if (child.ethpmPhysIf) {
        const a = child.ethpmPhysIf.attributes
        operSt = a.operSt ?? ''
        operSpeed = a.operSpeed ?? ''
        lastLinkStChg = parseDate(a.lastLinkStChg)
      }
      if (child.rmonIfIn) {
        const a = child.rmonIfIn.attributes
        rxBytes = pickBytes(a)
        rxPkts = pickInPkts(a)
        rxErrors = toBigInt(a.errors)
        rxDiscards = toBigInt(a.discards)
      }
      if (child.rmonIfOut) {
        const a = child.rmonIfOut.attributes
        txBytes = pickOutBytes(a)
        txPkts = pickOutPkts(a)
        txErrors = toBigInt(a.errors)
        txDiscards = toBigInt(a.discards)
      }
      if (child.rmonDot3Stats) {
        rxCrcErrors = toBigInt(child.rmonDot3Stats.attributes.fCSErrors)
      }
      if (child.rmonEtherStats) {
        const a = child.rmonEtherStats.attributes
        // Some platforms expose a single cRCAlignErrors field; alignment errors split out on others.
        rxAlignErrors = toBigInt(a.alignmentErrors ?? a.cRCAlignErrors)
      }
    }

    rows.push({
      dn,
      node,
      ifName,
      usage: usage ?? '',
      adminSt: adminSt ?? '',
      operSt,
      operSpeed,
      description: descr ?? '',
      lastLinkStChg,
      rxBytes,
      rxPkts,
      rxErrors,
      rxDiscards,
      rxCrcErrors,
      rxAlignErrors,
      txBytes,
      txPkts,
      txErrors,
      txDiscards,
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
