import { describe, expect, it } from 'bun:test'
import { isValidIpv4OrCidr, validateEsgCsv, validateEsgSelectorCsv } from './csv'

const esgHeaders = ['tenant', 'anp', 'esg', 'vrf', 'cons_contract', 'prov_contract', 'esg_desc']
const selectorHeaders = ['tenant', 'anp', 'esg', 'selector_type', 'selector_value']

describe('validateEsgCsv', () => {
  it('parses a row with contract lists and description', () => {
    const { rows, errors } = validateEsgCsv(
      [
        {
          tenant: 'TenantA',
          anp: 'APP',
          esg: 'ESG-WEB',
          vrf: 'VRF-PROD',
          cons_contract: 'DNS, NTP',
          prov_contract: 'WEB',
          esg_desc: 'Web tier',
        },
      ],
      esgHeaders,
    )

    expect(errors).toEqual([])
    expect(rows).toEqual([
      {
        rowIndex: 1,
        tenant: 'TenantA',
        anp: 'APP',
        esg: 'ESG-WEB',
        vrf: 'VRF-PROD',
        vrf_tenant: 'common',
        contract_tenant: 'common',
        consContracts: ['DNS', 'NTP'],
        provContracts: ['WEB'],
        esg_desc: 'Web tier',
      },
    ])
  })

  it('accepts ap as an alias for anp and treats contracts as optional', () => {
    const { rows, errors } = validateEsgCsv(
      [{ tenant: 'TenantA', ap: 'APP', esg: 'ESG-WEB', vrf: 'VRF' }],
      ['tenant', 'ap', 'esg', 'vrf'],
    )

    expect(errors).toEqual([])
    expect(rows[0]).toMatchObject({ anp: 'APP', consContracts: [], provContracts: [] })
  })

  it('reports missing headers including anp', () => {
    const { rows, errors } = validateEsgCsv([], ['tenant', 'esg'])

    expect(rows).toEqual([])
    expect(errors[0].message).toBe('Missing required columns: vrf, anp (or ap)')
  })

  it('defaults contract_tenant to common and accepts the row tenant', () => {
    const { rows, errors } = validateEsgCsv(
      [
        { tenant: 'TenantA', anp: 'APP', esg: 'E1', vrf: 'V' },
        { tenant: 'TenantA', anp: 'APP', esg: 'E2', vrf: 'V', contract_tenant: 'COMMON' },
        { tenant: 'TenantA', anp: 'APP', esg: 'E3', vrf: 'V', contract_tenant: 'TenantA' },
        { tenant: 'TenantA', anp: 'APP', esg: 'E4', vrf: 'V', contract_tenant: 'TenantB' },
      ],
      [...esgHeaders, 'contract_tenant'],
    )

    expect(rows.map((r) => r.contract_tenant)).toEqual(['common', 'common', 'TenantA'])
    expect(errors).toEqual([
      {
        rowIndex: 4,
        field: 'contract_tenant',
        message: 'contract_tenant must be empty, common, or match tenant',
      },
    ])
  })

  it('defaults vrf_tenant to common and accepts the row tenant', () => {
    const { rows, errors } = validateEsgCsv(
      [
        { tenant: 'TenantA', anp: 'APP', esg: 'E1', vrf: 'V' },
        { tenant: 'TenantA', anp: 'APP', esg: 'E2', vrf: 'V', vrf_tenant: 'Common' },
        { tenant: 'TenantA', anp: 'APP', esg: 'E3', vrf: 'V', vrf_tenant: 'TenantA' },
        { tenant: 'TenantA', anp: 'APP', esg: 'E4', vrf: 'V', vrf_tenant: 'TenantB' },
      ],
      [...esgHeaders, 'vrf_tenant'],
    )

    expect(rows.map((r) => r.vrf_tenant)).toEqual(['common', 'common', 'TenantA'])
    expect(errors).toEqual([
      {
        rowIndex: 4,
        field: 'vrf_tenant',
        message: 'vrf_tenant must be empty, common, or match tenant',
      },
    ])
  })

  it('rejects unsafe names and duplicate contracts', () => {
    const { rows, errors } = validateEsgCsv(
      [{ tenant: 'TenantA', anp: 'APP', esg: 'ESG/1', vrf: '', cons_contract: 'A,A' }],
      esgHeaders,
    )

    expect(rows).toEqual([])
    expect(errors.map((e) => e.field)).toEqual(['esg', 'vrf', 'cons_contract'])
  })

  it('rejects a second row for the same ESG', () => {
    const { rows, errors } = validateEsgCsv(
      [
        { tenant: 'TenantA', anp: 'APP', esg: 'ESG-WEB', vrf: 'V', cons_contract: 'A' },
        { tenant: 'TenantA', anp: 'APP', esg: 'ESG-WEB', vrf: 'V', prov_contract: 'B' },
      ],
      esgHeaders,
    )

    expect(rows.map((r) => r.rowIndex)).toEqual([1])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ rowIndex: 2, field: 'duplicate' })
  })
})

describe('validateEsgSelectorCsv', () => {
  it('parses epg and ip selectors', () => {
    const { rows, errors } = validateEsgSelectorCsv(
      [
        {
          tenant: 'TenantA',
          anp: 'APP',
          esg: 'ESG-WEB',
          selector_type: 'EPG',
          selector_value: 'WEB-EPG',
          epg_anp: 'OTHER-APP',
          selector_desc: 'web',
        },
        {
          tenant: 'TenantA',
          anp: 'APP',
          esg: 'ESG-WEB',
          selector_type: 'ip',
          selector_value: '10.1.1.0/24',
        },
      ],
      [...selectorHeaders, 'epg_anp', 'selector_desc'],
    )

    expect(errors).toEqual([])
    expect(rows).toEqual([
      {
        rowIndex: 1,
        tenant: 'TenantA',
        anp: 'APP',
        esg: 'ESG-WEB',
        selector_type: 'epg',
        selector_value: 'WEB-EPG',
        epg_anp: 'OTHER-APP',
        selector_desc: 'web',
      },
      {
        rowIndex: 2,
        tenant: 'TenantA',
        anp: 'APP',
        esg: 'ESG-WEB',
        selector_type: 'ip',
        selector_value: '10.1.1.0/24',
        epg_anp: undefined,
        selector_desc: undefined,
      },
    ])
  })

  it('rejects unknown types, bad addresses, and epg_anp on ip rows', () => {
    const { rows, errors } = validateEsgSelectorCsv(
      [
        { tenant: 'T', anp: 'A', esg: 'E', selector_type: 'tag', selector_value: 'x' },
        { tenant: 'T', anp: 'A', esg: 'E', selector_type: 'ip', selector_value: '10.1.1.300' },
        {
          tenant: 'T',
          anp: 'A',
          esg: 'E',
          selector_type: 'ip',
          selector_value: '10.1.1.1',
          epg_anp: 'A',
        },
      ],
      [...selectorHeaders, 'epg_anp'],
    )

    expect(rows).toEqual([])
    expect(errors.map((e) => [e.rowIndex, e.field])).toEqual([
      [1, 'selector_type'],
      [2, 'selector_value'],
      [3, 'epg_anp'],
    ])
  })

  it('rejects duplicate selectors and one EPG selected by two ESGs', () => {
    const { rows, errors } = validateEsgSelectorCsv(
      [
        { tenant: 'T', anp: 'A', esg: 'E1', selector_type: 'epg', selector_value: 'WEB' },
        { tenant: 'T', anp: 'A', esg: 'E1', selector_type: 'epg', selector_value: 'WEB' },
        { tenant: 'T', anp: 'A', esg: 'E2', selector_type: 'epg', selector_value: 'WEB' },
        { tenant: 'T', anp: 'A', esg: 'E2', selector_type: 'ip', selector_value: '10.0.0.1' },
      ],
      selectorHeaders,
    )

    expect(rows.map((r) => r.rowIndex)).toEqual([1, 4])
    expect(errors.map((e) => e.rowIndex)).toEqual([2, 3])
    expect(errors[1].message).toContain('selected by more than one ESG')
  })
})

describe('isValidIpv4OrCidr', () => {
  it('accepts hosts and prefixes, rejects malformed values', () => {
    expect(isValidIpv4OrCidr('10.0.0.1')).toBe(true)
    expect(isValidIpv4OrCidr('10.0.0.0/8')).toBe(true)
    expect(isValidIpv4OrCidr('10.0.0.0/33')).toBe(false)
    expect(isValidIpv4OrCidr('10.0.0/24')).toBe(false)
    expect(isValidIpv4OrCidr('10.0.0.1/24/1')).toBe(false)
    expect(isValidIpv4OrCidr('fe80::1')).toBe(false)
  })
})
