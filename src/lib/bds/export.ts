import 'server-only'
import * as XLSX from 'xlsx-js-style'
import type { BdRow } from './types'

const yesNo = (value: boolean | null) => (value === null ? '' : value ? 'Yes' : 'No')
export function buildBdWorkbook(rows: BdRow[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new()
  const sheets: Array<[string, unknown[][]]> = [
    [
      'Bridge Domains',
      [
        [
          'Bridge Domain',
          'Tenant',
          'VRF',
          'Routing Enabled',
          'Subnets',
          'EPG Count',
          'Description',
          'DN',
          'VRF DN',
          'L3Outs',
          'ARP Flooding',
          'IP Learning',
          'Limit IP Learning to Subnets',
          'Unknown Unicast',
          'Unknown Multicast',
          'Multi Destination Flooding',
        ],
        ...rows.map((r) => [
          r.name,
          r.tenant,
          r.vrf,
          yesNo(r.unicastRoute),
          r.subnets.map((s) => s.ip).join(', '),
          r.epgCount,
          r.description,
          r.dn,
          r.vrfDn,
          r.l3Outs.join(', '),
          yesNo(r.arpFlood),
          yesNo(r.ipLearning),
          yesNo(r.limitIpLearnToSubnets),
          r.unkMacUcastAct,
          r.unkMcastAct,
          r.multiDstPktAct,
        ]),
      ],
    ],
    [
      'Subnets',
      [
        [
          'Bridge Domain',
          'Tenant',
          'BD DN',
          'Subnet',
          'Description',
          'Scope',
          'Preferred',
          'Control',
          'IP Data Plane Learning',
        ],
        ...rows.flatMap((r) =>
          r.subnets.map((s) => [
            r.name,
            r.tenant,
            r.dn,
            s.ip,
            s.description,
            s.scope,
            yesNo(s.preferred),
            s.ctrl,
            s.ipDPLearning,
          ]),
        ),
      ],
    ],
    [
      'Connected EPGs',
      [
        [
          'Bridge Domain',
          'BD Tenant',
          'BD DN',
          'EPG',
          'EPG Tenant',
          'Application Profile',
          'EPG DN',
        ],
        ...rows.flatMap((r) =>
          r.epgs.map((e) => [r.name, r.tenant, r.dn, e.name, e.tenant, e.appProfile, e.dn]),
        ),
      ],
    ],
  ]
  for (const [name, data] of sheets) {
    const sheet = XLSX.utils.aoa_to_sheet(data)
    sheet['!cols'] = data[0].map(() => ({ wch: 28 }))
    sheet['!autofilter'] = { ref: sheet['!ref']! }
    data[0].forEach((_, c) => {
      sheet[XLSX.utils.encode_cell({ r: 0, c })].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: 'E2E8F0' } },
      }
    })
    XLSX.utils.book_append_sheet(workbook, sheet, name)
  }
  return workbook
}
export function serializeBdWorkbook(workbook: XLSX.WorkBook): Uint8Array {
  return new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}
export function bdExportFilename(hostName: string, scope: 'all' | 'filtered', now = new Date()) {
  const safeHost =
    hostName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'host'
  return `bridge-domains-${safeHost}-${scope}-${now.toISOString().replace(/[:.]/g, '-')}.xlsx`
}
