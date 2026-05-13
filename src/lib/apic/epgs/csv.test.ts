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
})
