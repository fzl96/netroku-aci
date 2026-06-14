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
