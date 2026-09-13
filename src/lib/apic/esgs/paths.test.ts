import { describe, expect, it } from 'bun:test'
import {
  buildEpgSelectorClassPath,
  buildEsgChildrenPath,
  buildEsgPath,
  buildSelectorDn,
  contractAttachmentPayload,
  esgDeletePayload,
  esgPayload,
  selectorDeletePayload,
  selectorPayload,
} from './paths'
import type { ParsedEsgRow, ParsedEsgSelectorRow } from './types'

const esg: ParsedEsgRow = {
  rowIndex: 1,
  tenant: 'TenantA',
  anp: 'APP',
  esg: 'ESG-WEB',
  vrf: 'VRF-PROD',
  consContracts: [],
  provContracts: [],
  esg_desc: 'Web tier',
}

const epgSelector: ParsedEsgSelectorRow = {
  rowIndex: 1,
  tenant: 'TenantA',
  anp: 'APP',
  esg: 'ESG-WEB',
  selector_type: 'epg',
  selector_value: 'WEB-EPG',
}

const ipSelector: ParsedEsgSelectorRow = {
  ...epgSelector,
  selector_type: 'ip',
  selector_value: '10.1.1.0/24',
  selector_desc: 'subnet',
}

describe('ESG paths', () => {
  it('builds ESG paths', () => {
    expect(buildEsgPath(esg)).toBe('/api/node/mo/uni/tn-TenantA/ap-APP/esg-ESG-WEB.json')
    expect(buildEsgChildrenPath(esg)).toBe(
      '/api/node/mo/uni/tn-TenantA/ap-APP/esg-ESG-WEB.json?query-target=children',
    )
  })

  it('builds selector DNs for epg and ip selectors', () => {
    expect(buildSelectorDn(epgSelector)).toBe(
      'uni/tn-TenantA/ap-APP/esg-ESG-WEB/epgselector-[uni/tn-TenantA/ap-APP/epg-WEB-EPG]',
    )
    expect(buildSelectorDn({ ...epgSelector, epg_anp: 'OTHER' })).toBe(
      'uni/tn-TenantA/ap-APP/esg-ESG-WEB/epgselector-[uni/tn-TenantA/ap-OTHER/epg-WEB-EPG]',
    )
    expect(buildSelectorDn(ipSelector)).toBe(
      "uni/tn-TenantA/ap-APP/esg-ESG-WEB/epselector-[ip=='10.1.1.0/24']",
    )
  })

  it('builds the EPG selector class query', () => {
    expect(buildEpgSelectorClassPath('uni/tn-TenantA/ap-APP/epg-WEB')).toBe(
      '/api/class/fvEPgSelector.json?query-target-filter=eq(fvEPgSelector.matchEpgDn,"uni/tn-TenantA/ap-APP/epg-WEB")',
    )
  })
})

describe('ESG payloads', () => {
  it('creates the ESG with its VRF scope', () => {
    expect(JSON.parse(esgPayload(esg))).toEqual({
      fvESg: {
        attributes: {
          dn: 'uni/tn-TenantA/ap-APP/esg-ESG-WEB',
          name: 'ESG-WEB',
          descr: 'Web tier',
          rn: 'esg-ESG-WEB',
          status: 'created,modified',
        },
        children: [
          {
            fvRsScope: {
              attributes: { tnFvCtxName: 'VRF-PROD', status: 'created,modified' },
              children: [],
            },
          },
        ],
      },
    })
  })

  it('attaches contracts by role', () => {
    expect(JSON.parse(contractAttachmentPayload('consumer', 'DNS'))).toEqual({
      fvRsCons: { attributes: { tnVzBrCPName: 'DNS', status: 'created,modified' }, children: [] },
    })
    expect(Object.keys(JSON.parse(contractAttachmentPayload('provider', 'WEB')))).toEqual([
      'fvRsProv',
    ])
  })

  it('deletes the ESG', () => {
    expect(JSON.parse(esgDeletePayload(esg))).toEqual({
      fvESg: {
        attributes: { dn: 'uni/tn-TenantA/ap-APP/esg-ESG-WEB', status: 'deleted' },
        children: [],
      },
    })
  })

  it('creates and deletes selectors', () => {
    expect(JSON.parse(selectorPayload(epgSelector))).toEqual({
      fvEPgSelector: {
        attributes: {
          dn: buildSelectorDn(epgSelector),
          matchEpgDn: 'uni/tn-TenantA/ap-APP/epg-WEB-EPG',
          descr: '',
          status: 'created,modified',
        },
        children: [],
      },
    })
    expect(JSON.parse(selectorPayload(ipSelector))).toEqual({
      fvEPSelector: {
        attributes: {
          dn: buildSelectorDn(ipSelector),
          matchExpression: "ip=='10.1.1.0/24'",
          descr: 'subnet',
          status: 'created,modified',
        },
        children: [],
      },
    })
    expect(JSON.parse(selectorDeletePayload(ipSelector))).toEqual({
      fvEPSelector: {
        attributes: { dn: buildSelectorDn(ipSelector), status: 'deleted' },
        children: [],
      },
    })
  })
})
