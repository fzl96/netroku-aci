import { describe, expect, it } from 'bun:test'
import { createApicReader } from '@/lib/apic/read-cache'
import {
  validateBridgeDomainL2RollbackRows,
  validateBridgeDomainL2Rows,
  validateBridgeDomainL3Rows,
} from './apic'
import {
  buildBridgeDomainChildrenPath,
  buildBridgeDomainPath,
  buildL3OutPath,
  buildTenantPath,
  buildVrfPath,
} from './paths'
import type { ParsedBridgeDomainL2Row, ParsedBridgeDomainL3Row } from './types'

function readerWith(
  imdataForPath: (path: string) => unknown[],
) {
  const calls = new Map<string, number>()
  const reader = createApicReader('apic.local', 'token', async (_host, path) => {
    calls.set(path, (calls.get(path) ?? 0) + 1)
    return Response.json({ imdata: imdataForPath(path) })
  })
  return { calls, reader }
}

const l2Rows: ParsedBridgeDomainL2Row[] = [
  { rowIndex: 1, tenant: 'TenantA', vrf: 'VRF-A', bd: 'BD-100' },
  { rowIndex: 2, tenant: 'TenantA', vrf: 'VRF-A', bd: 'BD-200' },
]

const l3Rows: ParsedBridgeDomainL3Row[] = [
  { ...l2Rows[0], subnet: '10.0.0.1/24', l3out: 'WAN' },
  { ...l2Rows[1], subnet: '10.0.1.1/24', l3out: 'WAN' },
]

describe('bridge-domain APIC validation grouping', () => {
  it('reads shared L2 tenant and VRF managed objects once', async () => {
    const { calls, reader } = readerWith(path =>
      path.includes('/BD-') ? [] : [{}]
    )

    const results = await validateBridgeDomainL2Rows(l2Rows, 'apic.local', 'token', reader)

    expect(results).toEqual([
      { rowIndex: 1, status: 'deploy' },
      { rowIndex: 2, status: 'deploy' },
    ])
    expect(calls.get(buildTenantPath('TenantA'))).toBe(1)
    expect(calls.get(buildVrfPath('TenantA', 'VRF-A'))).toBe(1)
    expect(calls.get(buildBridgeDomainPath('TenantA', 'BD-100'))).toBe(1)
    expect(calls.get(buildBridgeDomainPath('TenantA', 'BD-200'))).toBe(1)
  })

  it('reads shared L3 tenant, VRF, and L3Out managed objects once', async () => {
    const { calls, reader } = readerWith(path =>
      path.includes('/BD-') ? [] : [{}]
    )

    const results = await validateBridgeDomainL3Rows(l3Rows, 'apic.local', 'token', reader)

    expect(results).toEqual([
      { rowIndex: 1, status: 'deploy' },
      { rowIndex: 2, status: 'deploy' },
    ])
    expect(calls.get(buildTenantPath('TenantA'))).toBe(1)
    expect(calls.get(buildVrfPath('TenantA', 'VRF-A'))).toBe(1)
    expect(calls.get(buildL3OutPath('TenantA', 'WAN'))).toBe(1)
  })

  it('reads shared bridge-domain rollback state once', async () => {
    const duplicateRows = [l2Rows[0], { ...l2Rows[0], rowIndex: 2 }]
    const bdPath = buildBridgeDomainPath('TenantA', 'BD-100')
    const childrenPath = buildBridgeDomainChildrenPath('TenantA', 'BD-100')
    const { calls, reader } = readerWith(path => {
      if (path === bdPath) {
        return [{ fvBD: { attributes: { unicastRoute: 'no', unkMacUcastAct: 'flood', arpFlood: 'true' } } }]
      }
      if (path === childrenPath) {
        return [{ fvRsCtx: { attributes: { tnFvCtxName: 'VRF-A' } } }]
      }
      return []
    })

    const results = await validateBridgeDomainL2RollbackRows(
      duplicateRows,
      'apic.local',
      'token',
      reader,
    )

    expect(results).toEqual([
      { rowIndex: 1, status: 'rollback' },
      { rowIndex: 2, status: 'rollback' },
    ])
    expect(calls.get(bdPath)).toBe(1)
    expect(calls.get(childrenPath)).toBe(1)
  })
})
