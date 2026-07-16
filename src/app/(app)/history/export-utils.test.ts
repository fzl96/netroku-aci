import { describe, expect, it } from 'bun:test'
import { buildHistoryPayloadCsvExport } from './export-utils'

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
