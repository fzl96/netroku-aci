import { z } from 'zod'
import { apicFetch, apicLogin } from './client'
import { fetchApicClassPages } from './inventory-pages'
import type { BdInventoryRow } from '@/lib/bds/types'

const attributesSchema = z.record(z.string(), z.string())
const moSchema = z.object({
  attributes: attributesSchema,
  children: z.array(z.unknown()).optional(),
})
const BD_DN = /^uni\/tn-([^/]+)\/BD-([^/]+)$/
const EPG_DN = /^uni\/tn-([^/]+)\/ap-([^/]+)\/epg-([^/]+)$/
const flag = (value?: string): boolean | null =>
  value === 'yes' ? true : value === 'no' ? false : null

function mo(item: unknown, className: string) {
  const object = z.record(z.string(), z.unknown()).parse(item)
  return object[className] === undefined ? null : moSchema.parse(object[className])
}

/** Keep configuration and EPG associations in the same BD snapshot, independent of EPG sync age. */
export function parseBdRows(bds: unknown[], epgs: unknown[]): BdInventoryRow[] {
  const byDn = new Map<string, BdInventoryRow>()
  for (const item of bds) {
    const object = mo(item, 'fvBD')
    if (!object) throw new Error('Unexpected object in Bridge Domain inventory')
    const a = object.attributes
    const match = BD_DN.exec(a.dn ?? '')
    if (!match) throw new Error('Invalid Bridge Domain DN')
    const row: BdInventoryRow = {
      dn: a.dn,
      name: a.name || match[2],
      tenant: match[1],
      description: a.descr ?? '',
      vrf: '',
      vrfDn: '',
      unicastRoute: flag(a.unicastRoute),
      arpFlood: flag(a.arpFlood),
      ipLearning: flag(a.ipLearning),
      limitIpLearnToSubnets: flag(a.limitIpLearnToSubnets),
      unkMacUcastAct: a.unkMacUcastAct ?? '',
      unkMcastAct: a.unkMcastAct ?? '',
      multiDstPktAct: a.multiDstPktAct ?? '',
      subnets: [],
      l3Outs: [],
      epgs: [],
    }
    for (const child of object.children ?? []) {
      const subnet = mo(child, 'fvSubnet')?.attributes
      if (subnet?.ip)
        row.subnets.push({
          ip: subnet.ip,
          description: subnet.descr ?? '',
          scope: subnet.scope ?? '',
          preferred: flag(subnet.preferred),
          ctrl: subnet.ctrl ?? '',
          ipDPLearning: subnet.ipDPLearning ?? '',
        })
      const ctx = mo(child, 'fvRsCtx')?.attributes
      if (ctx) {
        row.vrf = ctx.tnFvCtxName ?? ''
        row.vrfDn = ctx.tDn ?? ''
      }
      const out = mo(child, 'fvRsBDToOut')?.attributes
      if (out?.tnL3extOutName) row.l3Outs.push(out.tnL3extOutName)
    }
    row.subnets.sort((a, b) => a.ip.localeCompare(b.ip, 'en', { numeric: true }))
    row.l3Outs = [...new Set(row.l3Outs)].sort()
    byDn.set(row.dn, row)
  }
  for (const item of epgs) {
    const object = mo(item, 'fvAEPg')
    if (!object) throw new Error('Unexpected object in EPG inventory')
    const a = object.attributes
    const match = EPG_DN.exec(a.dn ?? '')
    if (!match) throw new Error('Invalid EPG DN')
    const relation = object.children?.map((child) => mo(child, 'fvRsBd')?.attributes).find(Boolean)
    if (!relation || relation.state === 'unformed') continue
    // APIC's resolved target is authoritative. Without one, ACI resolves a named
    // relationship in the EPG tenant first, then in common. Never join by name alone.
    const localDn = `uni/tn-${match[1]}/BD-${relation.tnFvBDName}`
    const targetDn =
      relation.tDn || (byDn.has(localDn) ? localDn : `uni/tn-common/BD-${relation.tnFvBDName}`)
    const bd = byDn.get(targetDn)
    if (bd && !bd.epgs.some((epg) => epg.dn === a.dn))
      bd.epgs.push({
        dn: a.dn,
        name: a.name || match[3],
        tenant: match[1],
        appProfile: match[2],
      })
  }
  for (const bd of byDn.values()) bd.epgs.sort((a, b) => a.dn.localeCompare(b.dn))
  return [...byDn.values()]
}

export async function fetchBdInventoryFromApic(host: string, username: string, password: string) {
  const token = await apicLogin(host, username, password)
  const fetchPage = async (path: string): Promise<unknown> => {
    const response = await apicFetch(host, path, { token })
    if (!response.ok) throw new Error(`APIC inventory request failed: ${response.status}`)
    return response.json()
  }
  const bds = await fetchApicClassPages('fvBD', 'fvRsCtx,fvSubnet,fvRsBDToOut', fetchPage)
  const epgs = await fetchApicClassPages('fvAEPg', 'fvRsBd', fetchPage)
  return parseBdRows(bds, epgs)
}
