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
      epg_desc: 'Web tier',
    })
    expect('contract' in rows[0]).toBe(false)
  })

  it('returns parsed row for valid EPG contract row', () => {
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
    expect(rows[0]).toMatchObject({
      rowIndex: 1,
      tenant: 'TenantA',
      anp: 'APP-A',
      epg: 'WEB-EPG',
      bd: 'WEB-BD',
      contract: 'WEB-CONTRACT',
      epg_desc: 'Web tier',
    })
  })

  it('accepts ap as an alias for anp', () => {
    const { rows, errors } = validateEpgContractCsv([
      { tenant: 'TenantA', ap: 'APP-A', epg: 'WEB-EPG', bd: 'WEB-BD', contract: 'WEB-CONTRACT' },
    ], ['tenant', 'ap', 'epg', 'bd', 'contract'])

    expect(errors).toHaveLength(0)
    expect(rows[0].anp).toBe('APP-A')
  })

  it('rejects duplicate EPG contract rows', () => {
    const { rows, errors } = validateEpgContractCsv([
      { tenant: 'TenantA', anp: 'APP-A', epg: 'WEB-EPG', bd: 'WEB-BD', contract: 'WEB-CONTRACT' },
      { tenant: 'TenantA', anp: 'APP-A', epg: 'WEB-EPG', bd: 'WEB-BD', contract: 'WEB-CONTRACT' },
    ], headers)

    expect(rows).toHaveLength(1)
    expect(errors[0].field).toBe('duplicate')
  })
})
