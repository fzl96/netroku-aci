import type { ParsedSelectorRow, IpgType } from './types'

export function buildProfilePath(profile: string): string {
  return `/api/node/mo/uni/infra/accportprof-${profile}.json`
}

function buildSelectorDn(profile: string, selector: string): string {
  return `uni/infra/accportprof-${profile}/hports-${selector}-typ-range`
}

export function buildSelectorPath(profile: string, selector: string): string {
  return `/api/node/mo/${buildSelectorDn(profile, selector)}.json`
}

export function buildSelectorChildrenPath(profile: string, selector: string): string {
  // Query the selector with all its children (port blocks + IPG ref).
  return `/api/node/mo/${buildSelectorDn(profile, selector)}.json?query-target=children`
}

export function buildIpgDn(ipg_type: IpgType, ipg_name: string): string {
  const prefix = ipg_type === 'port' ? 'accportgrp' : 'accbundle'
  return `uni/infra/funcprof/${prefix}-${ipg_name}`
}

export function buildIpgPath(ipg_type: IpgType, ipg_name: string): string {
  return `/api/node/mo/${buildIpgDn(ipg_type, ipg_name)}.json`
}

export function buildProfilePortBlksQuery(profile: string): string {
  // All port blocks under this profile, regardless of selector. Used to detect
  // port-range conflicts across different selectors on the same profile.
  return `/api/node/mo/uni/infra/accportprof-${profile}.json?query-target=subtree&target-subtree-class=infraPortBlk`
}

export function selectorDeployPayload(row: ParsedSelectorRow): string {
  const tDn = buildIpgDn(row.ipg_type, row.ipg_name)
  return JSON.stringify({
    infraHPortS: {
      attributes: { name: row.selector_name, type: 'range', ...(row.description ? { descr: row.description } : {}) },
      children: [
        {
          infraPortBlk: {
            attributes: {
              name: row.selector_name,
              fromCard: String(row.card),
              toCard: String(row.card),
              fromPort: String(row.port_num),
              toPort: String(row.port_num),
              ...(row.description ? { descr: row.description } : {}),
            },
          },
        },
        { infraRsAccBaseGrp: { attributes: { tDn } } },
      ],
    },
  })
}

export function selectorDeletePayload(row: { interface_profile: string; selector_name: string }): string {
  return JSON.stringify({
    infraHPortS: {
      attributes: {
        dn: buildSelectorDn(row.interface_profile, row.selector_name),
        status: 'deleted',
      },
    },
  })
}
