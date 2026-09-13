import { describe, expect, it } from 'bun:test'
import {
  esgVrf,
  extraContracts,
  formatContracts,
  hasContract,
  hasSelector,
  parentEsgDn,
  parseIpMatchExpression,
  sameVrf,
  selectorCount,
  validateEsgVrf,
  type EsgChild,
} from './state'
import type { ParsedEsgSelectorRow } from './types'

const children: EsgChild[] = [
  { fvRsScope: { attributes: { tDn: 'uni/tn-TenantA/ctx-VRF-PROD' } } },
  { fvRsCons: { attributes: { tDn: 'uni/tn-common/brc-DNS', tnVzBrCPName: 'DNS' } } },
  { fvRsProv: { attributes: { tnVzBrCPName: 'WEB' } } },
  { fvEPgSelector: { attributes: { matchEpgDn: 'uni/tn-TenantA/ap-APP/epg-WEB' } } },
  { fvEPSelector: { attributes: { matchExpression: "ip == '10.1.1.0/24'" } } },
]

const row: ParsedEsgSelectorRow = {
  rowIndex: 1,
  tenant: 'TenantA',
  anp: 'APP',
  esg: 'ESG-WEB',
  selector_type: 'epg',
  selector_value: 'WEB',
}

describe('ESG state helpers', () => {
  it('reads the VRF from the scope relation', () => {
    expect(esgVrf(children)).toEqual({ name: 'VRF-PROD', tenant: 'TenantA' })
    expect(validateEsgVrf('TenantA/APP/ESG-WEB', 'VRF-PROD', children)).toBeNull()
    expect(validateEsgVrf('TenantA/APP/ESG-WEB', 'VRF-DEV', children)).toBe(
      'ESG TenantA/APP/ESG-WEB exists with VRF VRF-PROD, not VRF-DEV',
    )
  })

  it('compares VRF tenants only when both are known', () => {
    expect(sameVrf({ name: 'V', tenant: 'A' }, { name: 'V' })).toBe(true)
    expect(sameVrf({ name: 'V', tenant: 'A' }, { name: 'V', tenant: 'common' })).toBe(false)
    expect(sameVrf({ name: 'V' }, { name: 'W' })).toBe(false)
  })

  it('matches contracts by role and tenant', () => {
    expect(hasContract(children, { role: 'consumer', contract: 'DNS' }, 'common')).toBe(true)
    expect(hasContract(children, { role: 'consumer', contract: 'DNS' }, 'TenantA')).toBe(false)
    expect(hasContract(children, { role: 'provider', contract: 'DNS' }, 'common')).toBe(false)
    expect(hasContract(children, { role: 'provider', contract: 'WEB' }, 'TenantA')).toBe(true)
  })

  it('lists contracts on APIC that the CSV does not name', () => {
    const extras = extraContracts(children, { consContracts: [], provContracts: ['WEB'] })
    expect(extras).toEqual([{ role: 'consumer', contract: 'DNS' }])
    expect(formatContracts([...extras, { role: 'provider', contract: 'APP' }])).toBe(
      'consumed DNS; provided APP',
    )
  })

  it('finds selectors and counts them', () => {
    expect(selectorCount(children)).toBe(2)
    expect(hasSelector(children, row)).toBe(true)
    expect(hasSelector(children, { ...row, epg_anp: 'OTHER' })).toBe(false)
    expect(
      hasSelector(children, { ...row, selector_type: 'ip', selector_value: '10.1.1.0/24' }),
    ).toBe(true)
    expect(hasSelector(children, { ...row, selector_type: 'ip', selector_value: '10.1.1.0' })).toBe(
      false,
    )
  })

  it('parses IP expressions and parent ESG DNs', () => {
    expect(parseIpMatchExpression("ip=='10.0.0.1'")).toBe('10.0.0.1')
    expect(parseIpMatchExpression("ip=='10.0.0.1' && mac=='x'")).toBeUndefined()
    expect(parentEsgDn("uni/tn-TenantA/ap-APP/esg-ESG-DB/epselector-[ip=='10.0.0.1']")).toBe(
      'uni/tn-TenantA/ap-APP/esg-ESG-DB',
    )
    expect(parentEsgDn(undefined)).toBeUndefined()
  })
})
