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

  it('rejects missing contract relation', () => {
    expect(validateEpgRollbackState(row, [bdChild])).toContain('missing consumed/provided contract')
  })
})
