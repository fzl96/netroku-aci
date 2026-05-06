import { describe, it, expect } from 'bun:test'
import { validateCsvRows } from './csv'

const validRow = {
  tenant: 'TenantA', ap: 'App1', epg: 'Web-EPG',
  vlan: '100', node1: '101', node2: '102',
  port_type: 'vpc', interface_or_ipg: 'myVPC_IPG',
  mode: 'regular', immediacy: 'immediate',
}

describe('validateCsvRows', () => {
  it('returns parsed row for valid vpc row', () => {
    const { rows, errors } = validateCsvRows([validRow], ['tenant','ap','epg','vlan','node1','node2','port_type','interface_or_ipg','mode','immediacy'])
    expect(errors).toHaveLength(0)
    expect(rows[0]).toMatchObject({
      rowIndex: 1, tenant: 'TenantA', vlan: 100, node1: 101, node2: 102,
      port_type: 'vpc', mode: 'regular',
    })
  })

  it('errors if node2 is blank for vpc', () => {
    const { errors } = validateCsvRows([{ ...validRow, node2: '' }], ['tenant','ap','epg','vlan','node1','node2','port_type','interface_or_ipg','mode','immediacy'])
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe('node2')
  })

  it('errors if node2 is provided for pc', () => {
    const { errors } = validateCsvRows([{ ...validRow, port_type: 'pc', node2: '102' }], ['tenant','ap','epg','vlan','node1','node2','port_type','interface_or_ipg','mode','immediacy'])
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe('node2')
  })

  it('errors if vlan is out of range', () => {
    const { errors } = validateCsvRows([{ ...validRow, vlan: '5000' }], ['tenant','ap','epg','vlan','node1','node2','port_type','interface_or_ipg','mode','immediacy'])
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe('vlan')
  })

  it('errors if port_type is invalid', () => {
    const { errors } = validateCsvRows([{ ...validRow, port_type: 'lag' }], ['tenant','ap','epg','vlan','node1','node2','port_type','interface_or_ipg','mode','immediacy'])
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe('port_type')
  })

  it('errors if required headers are missing', () => {
    const { errors } = validateCsvRows([validRow], ['tenant','ap','epg'])
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe('headers')
  })

  it('sets node2 to null for pc rows', () => {
    const { rows } = validateCsvRows([{ ...validRow, port_type: 'pc', node2: '' }], ['tenant','ap','epg','vlan','node1','node2','port_type','interface_or_ipg','mode','immediacy'])
    expect(rows[0].node2).toBeNull()
  })
})
