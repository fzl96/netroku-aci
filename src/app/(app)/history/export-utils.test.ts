import { describe, expect, it } from 'bun:test'
import {
  buildHistoryPayloadCsvExport,
  buildHistoryPayloadSummary,
  formatHistoryPayloadSummary,
} from './export-utils'

const createdAt = new Date('2026-07-15T10:36:19.000Z')

describe('buildHistoryPayloadCsvExport', () => {
  it('recreates the static ports upload columns without internal fields', () => {
    const result = buildHistoryPayloadCsvExport({
      action: 'deploy',
      target: 'static-ports @ 10.220.251.51',
      createdAt,
      payload: [{
        rowIndex: 13,
        tenant: 'SERVERFARM',
        ap: 'DC-SERVERFARM_AP',
        epg: 'VLAN401_EPG',
        vlan: 401,
        node1: 1107,
        node2: null,
        port_type: 'port',
        interface_or_ipg: 'eth1/30',
        mode: 'regular',
        immediacy: 'immediate',
      }],
    })

    expect(result).toEqual({
      filename: 'static-ports-deploy-2026-07-15.csv',
      csv:
        'tenant,ap,epg,vlan,node1,node2,port_type,interface_or_ipg,mode,immediacy\r\n' +
        'SERVERFARM,DC-SERVERFARM_AP,VLAN401_EPG,401,1107,,port,eth1/30,regular,immediate',
    })
    expect(result?.csv).not.toContain('rowIndex')
  })

  it('recreates interface selector columns and excludes derived port fields', () => {
    const result = buildHistoryPayloadCsvExport({
      action: 'rollback',
      target: 'interface-selectors @ apic.example',
      createdAt,
      payload: [{
        rowIndex: 2,
        interface_profile: 'leaf101-intf-prof',
        selector_name: 'eth1-1',
        port: '1/1',
        ipg_name: 'leaf101-ipg',
        ipg_type: 'port',
        description: 'Server, rack 4',
        card: 1,
        port_num: 1,
      }],
    })

    expect(result).toEqual({
      filename: 'interface-selectors-rollback-2026-07-15.csv',
      csv:
        'interface_profile,selector_name,port,ipg_name,ipg_type,description\r\n' +
        'leaf101-intf-prof,eth1-1,1/1,leaf101-ipg,port,"Server, rack 4"',
    })
    expect(result?.csv).not.toContain('card')
    expect(result?.csv).not.toContain('port_num')
  })

  it.each([
    {
      target: 'bridge-domains:l2 @ apic.example',
      filename: 'bridge-domains-l2-deploy-2026-07-15.csv',
      payload: [{ rowIndex: 1, tenant: 'TenantA', bd: 'BD-A', vrf: 'VRF-A', bd_desc: 'Layer 2' }],
      csv: 'tenant,bd,vrf,bd_desc\r\nTenantA,BD-A,VRF-A,Layer 2',
    },
    {
      target: 'bridge-domains:l3 @ apic.example',
      filename: 'bridge-domains-l3-deploy-2026-07-15.csv',
      payload: [{ rowIndex: 1, tenant: 'TenantA', bd: 'BD-A', vrf: 'VRF-A', subnet: '10.0.0.1/24', l3out: 'OUT-A', bd_desc: null }],
      csv: 'tenant,bd,vrf,subnet,l3out,bd_desc\r\nTenantA,BD-A,VRF-A,10.0.0.1/24,OUT-A,',
    },
  ])('uses the canonical bridge domain mapping for $target', ({ target, filename, payload, csv }) => {
    expect(buildHistoryPayloadCsvExport({ action: 'deploy', target, createdAt, payload })).toEqual({
      filename,
      csv,
    })
  })

  it('converts unified EPG contract arrays back to upload cells', () => {
    const result = buildHistoryPayloadCsvExport({
      action: 'deploy',
      target: 'epg @ apic.example',
      createdAt,
      payload: [{
        rowIndex: 1,
        tenant: 'TenantA',
        anp: 'APP-A',
        epg: 'WEB-EPG',
        bd: 'BD-A',
        bd_tenant: 'TenantA',
        contract_tenant: 'common',
        phys_domain: 'phys-a',
        consContracts: ['DNS', 'NTP'],
        provContracts: ['WEB'],
        epg_desc: undefined,
      }],
    })

    expect(result?.csv).toBe(
      'tenant,anp,epg,bd_tenant,bd,phys_domain,contract_tenant,cons_contract,prov_contract,epg_desc\r\n' +
      'TenantA,APP-A,WEB-EPG,TenantA,BD-A,phys-a,common,"DNS,NTP",WEB,',
    )
  })

  it.each(['consumer', 'provider'])('recreates the %s EPG contract workflow columns', role => {
    const result = buildHistoryPayloadCsvExport({
      action: 'rollback',
      target: `epg:${role} @ apic.example`,
      createdAt,
      payload: [{
        rowIndex: 1,
        tenant: 'TenantA',
        anp: 'APP-A',
        epg: 'WEB-EPG',
        bd: 'BD-A',
        bd_tenant: 'TenantA',
        contract_tenant: 'common',
        phys_domain: null,
        contract: 'DNS',
        epg_desc: '',
      }],
    })

    expect(result).toEqual({
      filename: `epg-${role}-rollback-2026-07-15.csv`,
      csv:
        'tenant,anp,epg,bd_tenant,bd,phys_domain,contract_tenant,contract,epg_desc\r\n' +
        'TenantA,APP-A,WEB-EPG,TenantA,BD-A,,common,DNS,',
    })
  })

  it.each([
    {
      action: 'resync.nodes',
      target: 'static-ports @ apic.example',
      payload: [{ tenant: 'TenantA' }],
    },
    {
      action: 'deploy',
      target: 'unknown-workflow @ apic.example',
      payload: [{ tenant: 'TenantA' }],
    },
    {
      action: 'deploy',
      target: 'static-ports @ apic.example',
      payload: [],
    },
    {
      action: 'deploy',
      target: 'static-ports @ apic.example',
      payload: 'not an array',
    },
    {
      action: 'rollback',
      target: 'static-ports @ apic.example',
      payload: [{ tenant: 'TenantA' }, 42],
    },
  ])('does not export an unsupported or malformed history payload %#', input => {
    expect(buildHistoryPayloadCsvExport({ ...input, createdAt })).toBeNull()
  })
})

describe('buildHistoryPayloadSummary', () => {
  it('counts Static Port EPGs by tenant, application profile, and EPG', () => {
    const summary = buildHistoryPayloadSummary({
      action: 'deploy',
      target: 'static-ports @ apic.example',
      payload: [
        { tenant: 'TenantA', ap: 'APP-A', epg: 'WEB', interface_or_ipg: 'eth1/1' },
        { tenant: 'TenantA', ap: 'APP-A', epg: 'WEB', interface_or_ipg: 'eth1/2' },
        { tenant: 'TenantA', ap: 'APP-B', epg: 'WEB', interface_or_ipg: 'eth1/3' },
        { tenant: 'TenantB', ap: 'APP-A', epg: 'WEB', interface_or_ipg: 'eth1/4' },
      ],
    })

    expect(summary).toEqual({ rowCount: 4, uniqueCount: 3, objectLabel: 'EPG' })
    expect(formatHistoryPayloadSummary(summary!)).toBe('4 rows · 3 unique EPGs in payload')
  })

  it.each([
    {
      target: 'bridge-domains:l2 @ apic.example',
      payload: [
        { tenant: 'TenantA', bd: 'BD-A' },
        { tenant: 'TenantA', bd: 'BD-A' },
        { tenant: 'TenantB', bd: 'BD-A' },
      ],
      expected: { rowCount: 3, uniqueCount: 2, objectLabel: 'bridge domain' as const },
    },
    {
      target: 'bridge-domains:l3 @ apic.example',
      payload: [{ tenant: 'TenantA', bd: 'BD-A' }],
      expected: { rowCount: 1, uniqueCount: 1, objectLabel: 'bridge domain' as const },
    },
    {
      target: 'epg @ apic.example',
      payload: [
        { tenant: 'TenantA', anp: 'APP-A', epg: 'WEB' },
        { tenant: 'TenantA', anp: 'APP-A', epg: 'WEB' },
        { tenant: 'TenantA', anp: 'APP-A', epg: 'DB' },
      ],
      expected: { rowCount: 3, uniqueCount: 2, objectLabel: 'EPG' as const },
    },
    {
      target: 'epg:provider @ apic.example',
      payload: [
        { tenant: 'TenantA', anp: 'APP-A', epg: 'WEB', contract: 'DNS' },
        { tenant: 'TenantA', anp: 'APP-A', epg: 'WEB', contract: 'NTP' },
      ],
      expected: { rowCount: 2, uniqueCount: 1, objectLabel: 'EPG' as const },
    },
    {
      target: 'interface-selectors @ apic.example',
      payload: [
        { interface_profile: 'leaf101', selector_name: 'eth1-1' },
        { interface_profile: 'leaf101', selector_name: 'eth1-1' },
        { interface_profile: 'leaf102', selector_name: 'eth1-1' },
      ],
      expected: { rowCount: 3, uniqueCount: 2, objectLabel: 'interface selector' as const },
    },
  ])('summarizes unique objects for $target', ({ target, payload, expected }) => {
    expect(buildHistoryPayloadSummary({ action: 'rollback', target, payload })).toEqual(expected)
  })

  it('formats singular row and object grammar', () => {
    expect(formatHistoryPayloadSummary({
      rowCount: 1,
      uniqueCount: 1,
      objectLabel: 'bridge domain',
    })).toBe('1 row · 1 unique bridge domain in payload')
  })

  it('does not summarize unsupported or malformed payloads', () => {
    expect(buildHistoryPayloadSummary({
      action: 'resync.nodes',
      target: 'static-ports @ apic.example',
      payload: [{ tenant: 'TenantA', ap: 'APP-A', epg: 'WEB' }],
    })).toBeNull()
    expect(buildHistoryPayloadSummary({
      action: 'deploy',
      target: 'static-ports @ apic.example',
      payload: [],
    })).toBeNull()
  })
})
