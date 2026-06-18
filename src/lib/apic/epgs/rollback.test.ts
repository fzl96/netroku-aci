import { describe, expect, it } from 'bun:test'
import { validateEpgRollbackState, type EpgChild } from './rollback'
import type { ParsedEpgContractRow } from './types'

const row: ParsedEpgContractRow = {
  rowIndex: 1,
  tenant: 'TenantA',
  anp: 'APP-A',
  epg: 'WEB-EPG',
  bd: 'WEB-BD',
  contract: 'WEB-CONTRACT',
}

const bdChild: EpgChild = {
  fvRsBd: { attributes: { tnFvBDName: 'WEB-BD' } },
}

describe('validateEpgRollbackState', () => {
  it('accepts matching EPG with consumed contract', () => {
    expect(validateEpgRollbackState(row, [
      bdChild,
      { fvRsCons: { attributes: { tnVzBrCPName: 'WEB-CONTRACT' } } },
    ])).toBeNull()
  })

  it('accepts matching EPG with provided contract', () => {
    expect(validateEpgRollbackState(row, [
      bdChild,
      { fvRsProv: { attributes: { tnVzBrCPName: 'WEB-CONTRACT' } } },
    ])).toBeNull()
  })

  it('rejects BD mismatch', () => {
    expect(validateEpgRollbackState(row, [
      { fvRsBd: { attributes: { tnFvBDName: 'OTHER-BD' } } },
      { fvRsCons: { attributes: { tnVzBrCPName: 'WEB-CONTRACT' } } },
    ])).toContain('attached to BD OTHER-BD')
  })

  it('accepts matching common BD when APIC returns target DN', () => {
    expect(validateEpgRollbackState({ ...row, bd_tenant: 'common' }, [
      { fvRsBd: { attributes: { tDn: 'uni/tn-common/BD-WEB-BD' } } },
      { fvRsCons: { attributes: { tnVzBrCPName: 'WEB-CONTRACT' } } },
    ])).toBeNull()
  })

  it('rejects same-name BD in the wrong tenant when APIC returns target DN', () => {
    expect(validateEpgRollbackState({ ...row, bd_tenant: 'common' }, [
      { fvRsBd: { attributes: { tDn: 'uni/tn-TenantA/BD-WEB-BD' } } },
      { fvRsCons: { attributes: { tnVzBrCPName: 'WEB-CONTRACT' } } },
    ])).toContain('attached to BD TenantA/WEB-BD, not common/WEB-BD')
  })

  it('accepts matching common contract when APIC returns target DN', () => {
    expect(validateEpgRollbackState({ ...row, contract_tenant: 'common' }, [
      bdChild,
      { fvRsCons: { attributes: { tDn: 'uni/tn-common/brc-WEB-CONTRACT' } } },
    ])).toBeNull()
  })

  it('rejects same-name contract in the wrong tenant when APIC returns target DN', () => {
    expect(validateEpgRollbackState({ ...row, contract_tenant: 'common' }, [
      bdChild,
      { fvRsCons: { attributes: { tDn: 'uni/tn-TenantA/brc-WEB-CONTRACT' } } },
    ])).toContain('missing consumed/provided contract')
  })

  it('rejects missing contract relation', () => {
    expect(validateEpgRollbackState(row, [bdChild])).toContain('missing consumed/provided contract')
  })
})
