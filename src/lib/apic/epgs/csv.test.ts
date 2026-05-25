import { describe, expect, it } from 'bun:test'
import { validateEpgContractCsv, validateEpgCsv } from './csv'

const headers = ['tenant', 'anp', 'epg', 'bd', 'contract', 'epg_desc']

describe('validateEpgContractCsv', () => {
  it('returns parsed row for valid EPG-only row', () => {
    const { rows, errors } = validateEpgCsv([
      {
        tenant: 'TenantA',
        anp: 'APP-A',
        epg: 'WEB-EPG',
        bd: 'WEB-BD',
        epg_desc: 'Web tier',
      },
    ], ['tenant', 'anp', 'epg', 'bd', 'epg_desc'])

    expect(errors).toHaveLength(0)
    expect(rows[0]).toMatchObject({
      rowIndex: 1,
      tenant: 'TenantA',
      anp: 'APP-A',
      epg: 'WEB-EPG',
      bd: 'WEB-BD',
      consContracts: [],
      provContracts: [],
      epg_desc: 'Web tier',
    })
  })

  it('returns parsed row with consumed and provided contract lists', () => {
    const { rows, errors } = validateEpgCsv([
      {
        tenant: 'TenantA',
        anp: 'APP-A',
        epg: 'WEB-EPG',
        bd: 'WEB-BD',
        cons_contract: 'WEB-CONTRACT, API-CONTRACT',
        prov_contract: 'DB-CONTRACT',
        epg_desc: 'Web tier',
      },
    ], ['tenant', 'anp', 'epg', 'bd', 'cons_contract', 'prov_contract', 'epg_desc'])

    expect(errors).toHaveLength(0)
    expect(rows[0]).toMatchObject({
      rowIndex: 1,
      tenant: 'TenantA',
      anp: 'APP-A',
      epg: 'WEB-EPG',
      bd: 'WEB-BD',
      consContracts: ['WEB-CONTRACT', 'API-CONTRACT'],
      provContracts: ['DB-CONTRACT'],
      epg_desc: 'Web tier',
    })
  })

  it('defaults empty bd_tenant to the EPG tenant', () => {
    const { rows, errors } = validateEpgCsv([
      {
        tenant: 'SERVERFARM',
        anp: 'APP-A',
        epg: 'WEB-EPG',
        bd_tenant: '',
        bd: 'WEB-BD',
      },
    ], ['tenant', 'anp', 'epg', 'bd_tenant', 'bd'])

    expect(errors).toHaveLength(0)
    expect(rows[0].bd_tenant).toBe('SERVERFARM')
  })

  it('accepts common as a shared BD tenant', () => {
    const { rows, errors } = validateEpgCsv([
      {
        tenant: 'SERVERFARM',
        anp: 'APP-A',
        epg: 'WEB-EPG',
        bd_tenant: 'common',
        bd: 'SHARED-BD',
      },
    ], ['tenant', 'anp', 'epg', 'bd_tenant', 'bd'])

    expect(errors).toHaveLength(0)
    expect(rows[0].bd_tenant).toBe('common')
  })

  it('defaults empty contract_tenant to the EPG tenant', () => {
    const { rows, errors } = validateEpgCsv([
      {
        tenant: 'SERVERFARM',
        anp: 'APP-A',
        epg: 'WEB-EPG',
        bd: 'WEB-BD',
        contract_tenant: '',
        cons_contract: 'WEB-CONTRACT',
      },
    ], ['tenant', 'anp', 'epg', 'bd', 'contract_tenant', 'cons_contract'])

    expect(errors).toHaveLength(0)
    expect(rows[0].contract_tenant).toBe('SERVERFARM')
  })

  it('accepts common as a shared contract tenant', () => {
    const { rows, errors } = validateEpgCsv([
      {
        tenant: 'SERVERFARM',
        anp: 'APP-A',
        epg: 'WEB-EPG',
        bd: 'WEB-BD',
        contract_tenant: 'common',
        cons_contract: 'MSI-CRITICAL-NS-CT',
      },
    ], ['tenant', 'anp', 'epg', 'bd', 'contract_tenant', 'cons_contract'])

    expect(errors).toHaveLength(0)
    expect(rows[0].contract_tenant).toBe('common')
  })

  it('accepts optional physical domain', () => {
    const { rows, errors } = validateEpgCsv([
      {
        tenant: 'SERVERFARM',
        anp: 'APP-A',
        epg: 'WEB-EPG',
        bd: 'WEB-BD',
        phys_domain: 'MSI-PHYS-DOM',
      },
    ], ['tenant', 'anp', 'epg', 'bd', 'phys_domain'])

    expect(errors).toHaveLength(0)
    expect(rows[0].phys_domain).toBe('MSI-PHYS-DOM')
  })

  it('accepts physdom as a physical domain alias', () => {
    const { rows, errors } = validateEpgCsv([
      {
        tenant: 'SERVERFARM',
        anp: 'APP-A',
        epg: 'WEB-EPG',
        bd: 'WEB-BD',
        physdom: 'MSI-PHYS-DOM',
      },
    ], ['tenant', 'anp', 'epg', 'bd', 'physdom'])

    expect(errors).toHaveLength(0)
    expect(rows[0].phys_domain).toBe('MSI-PHYS-DOM')
  })

  it('rejects unsafe physical domain names', () => {
    const { rows, errors } = validateEpgCsv([
      {
        tenant: 'SERVERFARM',
        anp: 'APP-A',
        epg: 'WEB-EPG',
        bd: 'WEB-BD',
        phys_domain: 'bad/domain',
      },
    ], ['tenant', 'anp', 'epg', 'bd', 'phys_domain'])

    expect(rows).toHaveLength(0)
    expect(errors[0]).toMatchObject({
      field: 'phys_domain',
      message: 'phys_domain must not contain slashes or square brackets',
    })
  })

  it('rejects arbitrary cross-tenant contract tenants', () => {
    const { rows, errors } = validateEpgCsv([
      {
        tenant: 'SERVERFARM',
        anp: 'APP-A',
        epg: 'WEB-EPG',
        bd: 'WEB-BD',
        contract_tenant: 'SHARED-SERVICES',
        cons_contract: 'WEB-CONTRACT',
      },
    ], ['tenant', 'anp', 'epg', 'bd', 'contract_tenant', 'cons_contract'])

    expect(rows).toHaveLength(0)
    expect(errors[0]).toMatchObject({
      field: 'contract_tenant',
      message: 'contract_tenant must be empty, match tenant, or be common',
    })
  })

  it('rejects arbitrary cross-tenant BD tenants', () => {
    const { rows, errors } = validateEpgCsv([
      {
        tenant: 'SERVERFARM',
        anp: 'APP-A',
        epg: 'WEB-EPG',
        bd_tenant: 'SHARED-SERVICES',
        bd: 'SHARED-BD',
      },
    ], ['tenant', 'anp', 'epg', 'bd_tenant', 'bd'])

    expect(rows).toHaveLength(0)
    expect(errors[0]).toMatchObject({
      field: 'bd_tenant',
      message: 'bd_tenant must be empty, match tenant, or be common',
    })
  })

  it('returns parsed row for legacy EPG contract row', () => {
    const { rows, errors } = validateEpgContractCsv([
      {
        tenant: 'TenantA',
        anp: 'APP-A',
        epg: 'WEB-EPG',
        bd: 'WEB-BD',
        contract: 'WEB-CONTRACT',
        epg_desc: 'Web tier',
      },
    ], headers)

    expect(errors).toHaveLength(0)
    expect(rows[0].contract).toBe('WEB-CONTRACT')
  })

  it('accepts ap as an alias for anp', () => {
    const { rows, errors } = validateEpgCsv([
      { tenant: 'TenantA', ap: 'APP-A', epg: 'WEB-EPG', bd: 'WEB-BD' },
    ], ['tenant', 'ap', 'epg', 'bd'])

    expect(errors).toHaveLength(0)
    expect(rows[0].anp).toBe('APP-A')
  })

  it('rejects duplicate unified EPG rows with same contract sets', () => {
    const { rows, errors } = validateEpgCsv([
      { tenant: 'TenantA', anp: 'APP-A', epg: 'WEB-EPG', bd: 'WEB-BD', cons_contract: 'A,B', prov_contract: 'C' },
      { tenant: 'TenantA', anp: 'APP-A', epg: 'WEB-EPG', bd: 'WEB-BD', cons_contract: 'B,A', prov_contract: 'C' },
    ], ['tenant', 'anp', 'epg', 'bd', 'cons_contract', 'prov_contract'])

    expect(rows).toHaveLength(1)
    expect(errors[0].field).toBe('duplicate')
  })

  it('keeps common and same-tenant BD rows distinct during duplicate checks', () => {
    const { rows, errors } = validateEpgCsv([
      { tenant: 'TenantA', anp: 'APP-A', epg: 'WEB-EPG', bd: 'WEB-BD' },
      { tenant: 'TenantA', anp: 'APP-A', epg: 'WEB-EPG', bd_tenant: 'common', bd: 'WEB-BD' },
    ], ['tenant', 'anp', 'epg', 'bd_tenant', 'bd'])

    expect(errors).toHaveLength(0)
    expect(rows).toHaveLength(2)
  })

  it('keeps common and same-tenant contract rows distinct during duplicate checks', () => {
    const { rows, errors } = validateEpgCsv([
      { tenant: 'TenantA', anp: 'APP-A', epg: 'WEB-EPG', bd: 'WEB-BD', cons_contract: 'WEB-CONTRACT' },
      { tenant: 'TenantA', anp: 'APP-A', epg: 'WEB-EPG', bd: 'WEB-BD', contract_tenant: 'common', cons_contract: 'WEB-CONTRACT' },
    ], ['tenant', 'anp', 'epg', 'bd', 'contract_tenant', 'cons_contract'])

    expect(errors).toHaveLength(0)
    expect(rows).toHaveLength(2)
  })

  it('keeps rows with different physical domains distinct during duplicate checks', () => {
    const { rows, errors } = validateEpgCsv([
      { tenant: 'TenantA', anp: 'APP-A', epg: 'WEB-EPG', bd: 'WEB-BD', phys_domain: 'PHYS-A' },
      { tenant: 'TenantA', anp: 'APP-A', epg: 'WEB-EPG', bd: 'WEB-BD', phys_domain: 'PHYS-B' },
    ], ['tenant', 'anp', 'epg', 'bd', 'phys_domain'])

    expect(errors).toHaveLength(0)
    expect(rows).toHaveLength(2)
  })
})
