import { describe, expect, it } from 'bun:test'
import { createApicReader } from '@/lib/apic/read-cache'
import { validateEpgDeployRows } from './apic'
import {
  buildAppProfilePath,
  buildBridgeDomainPath,
  buildContractPath,
  buildEpgChildrenPath,
  buildEpgPath,
  buildPhysicalDomainPath,
  buildTenantPath,
} from './paths'
import type { ParsedEpgRow } from './types'

const rows: ParsedEpgRow[] = [
  {
    rowIndex: 1,
    tenant: 'TenantA',
    anp: 'AppA',
    epg: 'Web',
    bd: 'Web-BD',
    phys_domain: 'PHYS-A',
    consContracts: ['WEB-CONTRACT'],
    provContracts: [],
  },
  {
    rowIndex: 2,
    tenant: 'TenantA',
    anp: 'AppA',
    epg: 'Web',
    bd: 'Web-BD',
    phys_domain: 'PHYS-A',
    consContracts: [],
    provContracts: ['WEB-CONTRACT'],
  },
]

describe('EPG APIC validation grouping', () => {
  it('reads shared parents and EPG children once while preserving row results', async () => {
    const calls = new Map<string, number>()
    const childrenPath = buildEpgChildrenPath(rows[0])
    const reader = createApicReader('apic.local', 'token', async (_host, path) => {
      calls.set(path, (calls.get(path) ?? 0) + 1)
      if (path === childrenPath) {
        return Response.json({
          imdata: [
            { fvRsBd: { attributes: { tDn: 'uni/tn-TenantA/BD-Web-BD' } } },
            { fvRsDomAtt: { attributes: { tDn: 'uni/phys-PHYS-A' } } },
            { fvRsCons: { attributes: { tDn: 'uni/tn-TenantA/brc-WEB-CONTRACT' } } },
            { fvRsProv: { attributes: { tDn: 'uni/tn-TenantA/brc-WEB-CONTRACT' } } },
          ],
        })
      }
      return Response.json({ imdata: [{}] })
    })

    const results = await validateEpgDeployRows(rows, 'apic.local', 'token', reader)

    expect(results).toEqual([
      { rowIndex: 1, status: 'exists', message: undefined },
      { rowIndex: 2, status: 'exists', message: undefined },
    ])
    expect(calls.get(buildTenantPath('TenantA'))).toBe(1)
    expect(calls.get(buildAppProfilePath('TenantA', 'AppA'))).toBe(1)
    expect(calls.get(buildBridgeDomainPath('TenantA', 'Web-BD'))).toBe(1)
    expect(calls.get(buildPhysicalDomainPath('PHYS-A'))).toBe(1)
    expect(calls.get(buildContractPath('TenantA', 'WEB-CONTRACT'))).toBe(1)
    expect(calls.get(buildEpgPath(rows[0]))).toBe(1)
    expect(calls.get(childrenPath)).toBe(1)
  })
})
