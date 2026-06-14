import { describe, expect, it } from 'bun:test'
import { parseFaultRows, type FaultInstNode } from './faults'

describe('parseFaultRows', () => {
  it('maps a faultInst MO to a fault row', () => {
    const imdata: FaultInstNode[] = [
      {
        faultInst: {
          attributes: {
            dn: 'topology/pod-1/node-101/sys/phys-[eth1/1]/phys/fault-F1394',
            code: 'F1394',
            severity: 'major',
            domain: 'access',
            type: 'operational',
            cause: 'threshold-crossed',
            descr: 'rx errors high',
            ack: 'no',
            created: '2026-06-14T10:00:00.000+00:00',
            lastTransition: '2026-06-14T10:05:00.000+00:00',
          },
        },
      },
    ]
    const [row] = parseFaultRows(imdata)
    expect(row.dn).toBe('topology/pod-1/node-101/sys/phys-[eth1/1]/phys/fault-F1394')
    expect(row.code).toBe('F1394')
    expect(row.severity).toBe('major')
    expect(row.affectedDn).toBe('topology/pod-1/node-101/sys/phys-[eth1/1]/phys')
    expect(row.node).toBe('101')
    expect(row.ack).toBe(false)
    expect(row.created).toEqual(new Date('2026-06-14T10:00:00.000+00:00'))
  })

  it('derives null node for non-topology affected DNs', () => {
    const imdata: FaultInstNode[] = [
      {
        faultInst: {
          attributes: {
            dn: 'uni/tn-TenantA/fault-F0467',
            code: 'F0467',
            severity: 'minor',
            ack: 'yes',
          },
        },
      },
    ]
    const [row] = parseFaultRows(imdata)
    expect(row.affectedDn).toBe('uni/tn-TenantA')
    expect(row.node).toBeNull()
    expect(row.ack).toBe(true)
  })

  it('tolerates missing optional fields', () => {
    const imdata: FaultInstNode[] = [
      { faultInst: { attributes: { dn: 'uni/fault-F1', code: 'F1', severity: 'warning' } } },
    ]
    const [row] = parseFaultRows(imdata)
    expect(row.domain).toBe('')
    expect(row.descr).toBe('')
    expect(row.created).toBeNull()
    expect(row.node).toBeNull()
  })

  it('skips entries without a faultInst body', () => {
    expect(parseFaultRows([{} as FaultInstNode])).toEqual([])
  })
})
