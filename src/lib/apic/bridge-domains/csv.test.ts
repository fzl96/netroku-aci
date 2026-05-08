import { describe, it, expect } from 'bun:test'
import { validateBridgeDomainL2Csv, validateBridgeDomainL3Csv } from './csv'

const l2Headers = ['tenant', 'bd', 'vrf', 'bd_desc']
const l3Headers = ['tenant', 'bd', 'vrf', 'subnet', 'l3out', 'bd_desc']

describe('validateBridgeDomainL2Csv', () => {
  it('returns parsed row for valid L2 row', () => {
    const { rows, errors } = validateBridgeDomainL2Csv([
      { tenant: 'TenantA', bd: 'BD-100', vrf: 'VRF-A', bd_desc: 'L2 BD' },
    ], l2Headers)

    expect(errors).toHaveLength(0)
    expect(rows[0]).toMatchObject({
      rowIndex: 1,
      tenant: 'TenantA',
      bd: 'BD-100',
      vrf: 'VRF-A',
      bd_desc: 'L2 BD',
    })
  })

  it('rejects duplicate tenant and bridge domain rows', () => {
    const { rows, errors } = validateBridgeDomainL2Csv([
      { tenant: 'TenantA', bd: 'BD-100', vrf: 'VRF-A' },
      { tenant: 'TenantA', bd: 'BD-100', vrf: 'VRF-A' },
    ], l2Headers)

    expect(rows).toHaveLength(1)
    expect(errors[0].field).toBe('duplicate')
  })
})

describe('validateBridgeDomainL3Csv', () => {
  it('returns parsed row for valid L3 row', () => {
    const { rows, errors } = validateBridgeDomainL3Csv([
      { tenant: 'TenantA', bd: 'BD-200', vrf: 'VRF-A', subnet: '10.0.0.1/24', l3out: 'L3OUT-A' },
    ], l3Headers)

    expect(errors).toHaveLength(0)
    expect(rows[0]).toMatchObject({
      rowIndex: 1,
      tenant: 'TenantA',
      bd: 'BD-200',
      subnet: '10.0.0.1/24',
      l3out: 'L3OUT-A',
    })
  })

  it('rejects invalid subnet format', () => {
    const { errors } = validateBridgeDomainL3Csv([
      { tenant: 'TenantA', bd: 'BD-200', vrf: 'VRF-A', subnet: '10.0.0.1', l3out: 'L3OUT-A' },
    ], l3Headers)

    expect(errors[0].field).toBe('subnet')
  })
})
