import { describe, expect, it } from 'bun:test'
import { createApicReader } from '@/lib/apic/read-cache'
import {
  validateEsgDeployRows,
  validateEsgRollbackRows,
  validateEsgSelectorDeployRows,
  validateEsgSelectorRollbackRows,
} from './apic'
import {
  buildBridgeDomainChildrenPath,
  buildEpgChildrenPathFromDn,
  buildEpgSelectorClassPath,
  buildEsgChildrenPath,
  buildEsgChildrenPathFromDn,
  buildEsgPath,
  buildIpSelectorClassPath,
} from './paths'
import type { ParsedEsgRow, ParsedEsgSelectorRow } from './types'

/** Reader backed by a path -> imdata map. Unlisted paths return one empty object (exists). */
function fakeReader(responses: Record<string, unknown[] | 404>) {
  return createApicReader('apic.local', 'token', async (_host, path) => {
    const response = responses[path]
    if (response === 404) return new Response('not found', { status: 404 })
    return Response.json({ imdata: response ?? [{}] })
  })
}

const esgRow: ParsedEsgRow = {
  rowIndex: 1,
  tenant: 'TenantA',
  anp: 'APP',
  esg: 'ESG-WEB',
  vrf: 'VRF-PROD',
  contract_tenant: 'TenantA',
  consContracts: ['DNS'],
  provContracts: [],
  esg_desc: 'Web tier',
}

const existingEsg = { fvESg: { attributes: { descr: 'Web tier' } } }
const scope = { fvRsScope: { attributes: { tDn: 'uni/tn-TenantA/ctx-VRF-PROD' } } }

describe('validateEsgDeployRows', () => {
  it('marks a new ESG for deploy', async () => {
    const reader = fakeReader({ [buildEsgPath(esgRow)]: 404 })
    const results = await validateEsgDeployRows([esgRow], 'apic.local', 'token', reader)
    expect(results).toEqual([{ rowIndex: 1, status: 'deploy' }])
  })

  it('skips an unchanged ESG but warns about contracts that will be kept', async () => {
    const reader = fakeReader({
      [buildEsgPath(esgRow)]: [existingEsg],
      [buildEsgChildrenPath(esgRow)]: [
        scope,
        { fvRsCons: { attributes: { tnVzBrCPName: 'DNS' } } },
        { fvRsProv: { attributes: { tnVzBrCPName: 'LEGACY' } } },
      ],
    })
    const [result] = await validateEsgDeployRows([esgRow], 'apic.local', 'token', reader)
    expect(result).toEqual({
      rowIndex: 1,
      status: 'exists',
      warning: 'APIC has contracts not listed in the CSV. They will be kept: provided LEGACY',
    })
  })

  it('updates an existing ESG with a new description and missing contract', async () => {
    const reader = fakeReader({
      [buildEsgPath(esgRow)]: [{ fvESg: { attributes: { descr: 'old' } } }],
      [buildEsgChildrenPath(esgRow)]: [scope],
    })
    const [result] = await validateEsgDeployRows([esgRow], 'apic.local', 'token', reader)
    expect(result).toEqual({
      rowIndex: 1,
      status: 'deploy',
      message: 'ESG exists; description, contracts (consumed DNS) will be updated',
      warning: undefined,
    })
  })

  it('rejects an existing ESG in a different VRF', async () => {
    const reader = fakeReader({
      [buildEsgPath(esgRow)]: [existingEsg],
      [buildEsgChildrenPath(esgRow)]: [scope],
    })
    const [result] = await validateEsgDeployRows(
      [{ ...esgRow, vrf: 'VRF-DEV' }],
      'apic.local',
      'token',
      reader,
    )
    expect(result.status).toBe('error')
    expect(result.message).toContain('exists with VRF VRF-PROD, not VRF-DEV')
  })

  it('reports a missing contract', async () => {
    const reader = fakeReader({ '/api/node/mo/uni/tn-TenantA/brc-DNS.json': [] })
    const [result] = await validateEsgDeployRows([esgRow], 'apic.local', 'token', reader)
    expect(result).toEqual({
      rowIndex: 1,
      status: 'error',
      message: 'Contract not found: TenantA/DNS',
    })
  })
})

describe('validateEsgRollbackRows', () => {
  it('blocks rollback while selectors remain', async () => {
    const reader = fakeReader({
      [buildEsgPath(esgRow)]: [existingEsg],
      [buildEsgChildrenPath(esgRow)]: [
        scope,
        { fvRsCons: { attributes: { tnVzBrCPName: 'DNS' } } },
        { fvEPSelector: { attributes: { matchExpression: "ip=='10.0.0.1'" } } },
      ],
    })
    const [result] = await validateEsgRollbackRows([esgRow], 'apic.local', 'token', reader)
    expect(result.status).toBe('error')
    expect(result.message).toContain(
      'still has 1 selector; remove them with Rollback Selectors first',
    )
  })

  it('rejects rollback when a listed contract is not attached', async () => {
    const reader = fakeReader({
      [buildEsgPath(esgRow)]: [existingEsg],
      [buildEsgChildrenPath(esgRow)]: [scope],
    })
    const [result] = await validateEsgRollbackRows([esgRow], 'apic.local', 'token', reader)
    expect(result.status).toBe('error')
    expect(result.message).toContain('missing contracts listed in the CSV: consumed DNS')
  })

  it('allows rollback of a matching ESG without selectors, and reports missing ESGs', async () => {
    const reader = fakeReader({
      [buildEsgPath(esgRow)]: [existingEsg],
      [buildEsgChildrenPath(esgRow)]: [
        scope,
        { fvRsCons: { attributes: { tnVzBrCPName: 'DNS' } } },
      ],
      [buildEsgPath({ ...esgRow, esg: 'GONE' })]: 404,
    })
    const results = await validateEsgRollbackRows(
      [esgRow, { ...esgRow, rowIndex: 2, esg: 'GONE' }],
      'apic.local',
      'token',
      reader,
    )
    expect(results).toEqual([
      { rowIndex: 1, status: 'rollback' },
      { rowIndex: 2, status: 'missing' },
    ])
  })
})

const epgRow: ParsedEsgSelectorRow = {
  rowIndex: 1,
  tenant: 'TenantA',
  anp: 'APP',
  esg: 'ESG-WEB',
  selector_type: 'epg',
  selector_value: 'WEB',
}
const ipRow: ParsedEsgSelectorRow = { ...epgRow, selector_type: 'ip', selector_value: '10.0.0.1' }
const epgDn = 'uni/tn-TenantA/ap-APP/epg-WEB'

function selectorFixtures(overrides: Record<string, unknown[] | 404> = {}) {
  return {
    [buildEsgPath(epgRow)]: [existingEsg],
    [buildEsgChildrenPath(epgRow)]: [scope],
    [buildEpgChildrenPathFromDn(epgDn)]: [
      { fvRsBd: { attributes: { tDn: 'uni/tn-TenantA/BD-WEB-BD' } } },
    ],
    [buildBridgeDomainChildrenPath('TenantA', 'WEB-BD')]: [
      { fvRsCtx: { attributes: { tnFvCtxName: 'VRF-PROD' } } },
    ],
    [buildEpgSelectorClassPath(epgDn)]: [],
    [buildIpSelectorClassPath('10.0.0.1')]: [],
    ...overrides,
  }
}

describe('validateEsgSelectorDeployRows', () => {
  it('marks new epg and ip selectors for deploy', async () => {
    const reader = fakeReader(selectorFixtures())
    const results = await validateEsgSelectorDeployRows(
      [epgRow, { ...ipRow, rowIndex: 2 }],
      'apic.local',
      'token',
      reader,
    )
    expect(results).toEqual([
      { rowIndex: 1, status: 'deploy' },
      { rowIndex: 2, status: 'deploy' },
    ])
  })

  it('requires the ESG to exist', async () => {
    const reader = fakeReader(selectorFixtures({ [buildEsgPath(epgRow)]: 404 }))
    const [result] = await validateEsgSelectorDeployRows([epgRow], 'apic.local', 'token', reader)
    expect(result.status).toBe('error')
    expect(result.message).toContain('Deploy the ESG before adding selectors')
  })

  it('skips a selector that is already on the ESG', async () => {
    const reader = fakeReader(
      selectorFixtures({
        [buildEsgChildrenPath(epgRow)]: [
          scope,
          { fvEPgSelector: { attributes: { matchEpgDn: epgDn } } },
        ],
      }),
    )
    const [result] = await validateEsgSelectorDeployRows([epgRow], 'apic.local', 'token', reader)
    expect(result).toEqual({ rowIndex: 1, status: 'exists' })
  })

  it('rejects an EPG in a different VRF', async () => {
    const reader = fakeReader(
      selectorFixtures({
        [buildBridgeDomainChildrenPath('TenantA', 'WEB-BD')]: [
          { fvRsCtx: { attributes: { tnFvCtxName: 'VRF-DEV' } } },
        ],
      }),
    )
    const [result] = await validateEsgSelectorDeployRows([epgRow], 'apic.local', 'token', reader)
    expect(result.message).toBe(
      'EPG WEB is in VRF TenantA/VRF-DEV, but ESG TenantA/APP/ESG-WEB is in VRF TenantA/VRF-PROD',
    )
  })

  it('rejects an EPG already selected by another ESG', async () => {
    const reader = fakeReader(
      selectorFixtures({
        [buildEpgSelectorClassPath(epgDn)]: [
          {
            fvEPgSelector: {
              attributes: { dn: `uni/tn-TenantA/ap-APP/esg-ESG-OTHER/epgselector-[${epgDn}]` },
            },
          },
        ],
      }),
    )
    const [result] = await validateEsgSelectorDeployRows([epgRow], 'apic.local', 'token', reader)
    expect(result.message).toContain('already selected by uni/tn-TenantA/ap-APP/esg-ESG-OTHER')
  })

  it('rejects an IP used by another ESG in the same VRF but allows other VRFs', async () => {
    const otherDn = 'uni/tn-TenantA/ap-APP/esg-ESG-DB'
    const selector = {
      fvEPSelector: {
        attributes: {
          dn: `${otherDn}/epselector-[ip=='10.0.0.1']`,
          matchExpression: "ip=='10.0.0.1'",
        },
      },
    }
    const looseMatch = {
      fvEPSelector: {
        attributes: {
          dn: "uni/tn-TenantA/ap-APP/esg-ESG-X/epselector-[ip=='10.0.0.10']",
          matchExpression: "ip=='10.0.0.10'",
        },
      },
    }

    const sameVrf = fakeReader(
      selectorFixtures({
        [buildIpSelectorClassPath('10.0.0.1')]: [selector, looseMatch],
        [buildEsgChildrenPathFromDn(otherDn)]: [scope],
      }),
    )
    const [conflict] = await validateEsgSelectorDeployRows([ipRow], 'apic.local', 'token', sameVrf)
    expect(conflict.message).toBe(`IP 10.0.0.1 is already selected by ${otherDn} in the same VRF`)

    const otherVrf = fakeReader(
      selectorFixtures({
        [buildIpSelectorClassPath('10.0.0.1')]: [selector],
        [buildEsgChildrenPathFromDn(otherDn)]: [
          { fvRsScope: { attributes: { tDn: 'uni/tn-TenantA/ctx-VRF-DEV' } } },
        ],
      }),
    )
    const [ok] = await validateEsgSelectorDeployRows([ipRow], 'apic.local', 'token', otherVrf)
    expect(ok).toEqual({ rowIndex: 1, status: 'deploy' })
  })
})

describe('validateEsgSelectorRollbackRows', () => {
  it('marks present selectors for rollback and absent ones as missing', async () => {
    const reader = fakeReader(
      selectorFixtures({
        [buildEsgChildrenPath(epgRow)]: [
          scope,
          { fvEPSelector: { attributes: { matchExpression: "ip=='10.0.0.1'" } } },
        ],
      }),
    )
    const results = await validateEsgSelectorRollbackRows(
      [ipRow, { ...epgRow, rowIndex: 2 }],
      'apic.local',
      'token',
      reader,
    )
    expect(results).toEqual([
      { rowIndex: 1, status: 'rollback' },
      {
        rowIndex: 2,
        status: 'missing',
        message: 'Selector not found on ESG TenantA/APP/ESG-WEB',
      },
    ])
  })
})
