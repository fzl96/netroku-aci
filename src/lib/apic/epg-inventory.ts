import { apicFetch, apicLogin } from './client'

export interface EpgBindingRow {
  dn: string
  pathTDn: string
  pod: string
  node: string
  port: string
  pathType: string
  encap: string
  mode: string
}

export interface EpgRow {
  dn: string
  name: string
  tenant: string
  appProfile: string
  description: string
  bridgeDomain: string
  pcTag: string
  preferredGroup: boolean
  isolation: boolean
  domains: string[]
  providedContracts: string[]
  consumedContracts: string[]
  bindings: EpgBindingRow[]
}

interface FvAEPgAttrs {
  dn: string
  name: string
  descr?: string
  pcTag?: string
  prefGrMemb?: string
  pcEnfPref?: string
}

interface FvAEPgChild {
  fvRsBd?: { attributes: { tnFvBDName?: string } }
  fvRsDomAtt?: { attributes: { tDn?: string } }
  fvRsProv?: { attributes: { tnVzBrCPName?: string } }
  fvRsCons?: { attributes: { tnVzBrCPName?: string } }
  fvRsPathAtt?: { attributes: { tDn?: string; encap?: string; mode?: string } }
}

const EPG_DN_RE = /^uni\/tn-([^/]+)\/ap-([^/]+)\/epg-(.+)$/

// Static bindings target one of three path shapes. Check protpaths first
// because a non-anchored "paths-" also appears inside "protpaths-".
const PROT_TDN_RE = /^topology\/pod-(\d+)\/protpaths-(\d+)-(\d+)\/pathep-\[([^\]]+)\]$/
const PATH_TDN_RE = /^topology\/pod-(\d+)\/paths-(\d+)\/pathep-\[([^\]]+)\]$/

// APIC fvRsPathAtt.mode → the terms network engineers actually use.
const MODE_LABEL: Record<string, string> = {
  regular: 'trunk',
  untagged: 'access',
  native: 'native',
}

/**
 * Resolve a static-binding target DN to pod/node/port. vPC protection paths
 * span both leaves and are kept as ONE ascending "<lo>-<hi>" node pair (same
 * convention as the endpoints collector). A single path whose bracketed name
 * is not an ethX/Y port is a direct port-channel policy group. Unrecognized
 * shapes (e.g. FEX extpaths) come back as pathType "unknown" with the raw tDn
 * preserved in `port` so nothing is silently dropped.
 */
export function parsePathTDn(
  tDn: string,
): { pod: string; node: string; port: string; pathType: string } {
  const vpc = PROT_TDN_RE.exec(tDn)
  if (vpc) {
    const [lo, hi] = [Number(vpc[2]), Number(vpc[3])].sort((a, b) => a - b)
    return { pod: vpc[1], node: `${lo}-${hi}`, port: vpc[4], pathType: 'vpc' }
  }
  const single = PATH_TDN_RE.exec(tDn)
  if (single) {
    const port = single[3]
    const pathType = /^eth\d/.test(port) ? 'port' : 'dpc'
    return { pod: single[1], node: single[2], port, pathType }
  }
  const pod = /^topology\/pod-(\d+)\//.exec(tDn)?.[1] ?? ''
  return { pod, node: '', port: tDn, pathType: 'unknown' }
}

/** Turn a fvRsDomAtt target DN into a short human-readable domain label. */
export function domainLabelFromTDn(tDn: string): string {
  const vmm = /^uni\/vmmp-([^/]+)\/dom-(.+)$/.exec(tDn)
  if (vmm) return `${vmm[2]} (vmm ${vmm[1]})`
  const phys = /^uni\/phys-(.+)$/.exec(tDn)
  if (phys) return `${phys[1]} (physical)`
  const l2 = /^uni\/l2dom-(.+)$/.exec(tDn)
  if (l2) return `${l2[1]} (l2)`
  const l3 = /^uni\/l3dom-(.+)$/.exec(tDn)
  if (l3) return `${l3[1]} (l3)`
  return tDn
}

/**
 * Transform raw `fvAEPg` imdata (with rsp-subtree children) into EpgRow[].
 * Pure — no network — so all parsing is unit-testable. Subtree children don't
 * reliably carry a dn, so each binding's dn is rebuilt deterministically from
 * its rn format: `<epgDn>/rspathAtt-[<tDn>]`.
 */
export function parseEpgRows(imdata: unknown[]): EpgRow[] {
  const rows: EpgRow[] = []

  for (const item of imdata) {
    const mo = (item as { fvAEPg?: { attributes: FvAEPgAttrs; children?: FvAEPgChild[] } }).fvAEPg
    if (!mo) continue

    const a = mo.attributes
    const dnMatch = EPG_DN_RE.exec(a.dn ?? '')
    if (!dnMatch) continue

    const row: EpgRow = {
      dn: a.dn,
      name: a.name ?? dnMatch[3],
      tenant: dnMatch[1],
      appProfile: dnMatch[2],
      description: a.descr ?? '',
      bridgeDomain: '',
      pcTag: a.pcTag ?? '',
      preferredGroup: a.prefGrMemb === 'include',
      isolation: a.pcEnfPref === 'enforced',
      domains: [],
      providedContracts: [],
      consumedContracts: [],
      bindings: [],
    }

    for (const child of mo.children ?? []) {
      const bd = child.fvRsBd?.attributes.tnFvBDName
      if (bd) row.bridgeDomain = bd

      const domTDn = child.fvRsDomAtt?.attributes.tDn
      if (domTDn) row.domains.push(domainLabelFromTDn(domTDn))

      const prov = child.fvRsProv?.attributes.tnVzBrCPName
      if (prov) row.providedContracts.push(prov)

      const cons = child.fvRsCons?.attributes.tnVzBrCPName
      if (cons) row.consumedContracts.push(cons)

      const path = child.fvRsPathAtt?.attributes
      if (path?.tDn) {
        const { pod, node, port, pathType } = parsePathTDn(path.tDn)
        row.bindings.push({
          dn: `${a.dn}/rspathAtt-[${path.tDn}]`,
          pathTDn: path.tDn,
          pod,
          node,
          port,
          pathType,
          encap: path.encap ?? '',
          mode: MODE_LABEL[path.mode ?? ''] ?? (path.mode ?? ''),
        })
      }
    }

    rows.push(row)
  }

  return rows
}

async function apicGet(host: string, token: string, path: string): Promise<unknown[]> {
  const res = await apicFetch(host, path, { token })
  if (!res.ok) throw new Error(`APIC GET ${path} failed: ${res.status}`)
  const data = await res.json() as { imdata?: unknown[] }
  return data.imdata ?? []
}

export async function fetchEpgInventoryFromApic(
  host: string,
  username: string,
  plaintextPassword: string,
): Promise<EpgRow[]> {
  const token = await apicLogin(host, username, plaintextPassword)
  const imdata = await apicGet(
    host,
    token,
    '/api/node/class/fvAEPg.json?rsp-subtree=children&rsp-subtree-class=fvRsPathAtt,fvRsBd,fvRsDomAtt,fvRsProv,fvRsCons',
  )
  return parseEpgRows(imdata)
}
