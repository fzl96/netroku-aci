import { z } from 'zod'

export const bdSubnetsSchema = z.array(
  z.object({
    ip: z.string(),
    description: z.string(),
    scope: z.string(),
    preferred: z.boolean().nullable(),
    ctrl: z.string(),
    ipDPLearning: z.string(),
  }),
)
export const bdEpgsSchema = z.array(
  z.object({
    dn: z.string(),
    name: z.string(),
    tenant: z.string(),
    appProfile: z.string(),
  }),
)
export type BdSubnet = z.infer<typeof bdSubnetsSchema>[number]
export type BdEpg = z.infer<typeof bdEpgsSchema>[number]
export type BdInventoryRow = {
  dn: string
  name: string
  tenant: string
  description: string
  vrf: string
  vrfDn: string
  unicastRoute: boolean | null
  arpFlood: boolean | null
  ipLearning: boolean | null
  limitIpLearnToSubnets: boolean | null
  unkMacUcastAct: string
  unkMcastAct: string
  multiDstPktAct: string
  subnets: BdSubnet[]
  l3Outs: string[]
  epgs: BdEpg[]
}
export type BdRow = BdInventoryRow & { id: string; apicHostId: string; epgCount: number }

export function bdSearchText(row: BdInventoryRow): string {
  return [
    row.name,
    row.tenant,
    row.dn,
    row.description,
    row.vrf,
    row.vrfDn,
    ...row.subnets.map((s) => s.ip),
    ...row.l3Outs,
    ...row.epgs.flatMap((e) => [e.name, e.tenant, e.appProfile]),
  ].join('\n')
}
