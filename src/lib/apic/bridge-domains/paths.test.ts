import { describe, it, expect } from 'bun:test'
import {
  bridgeDomainL2Payload,
  bridgeDomainL3Payload,
  bridgeDomainDeletePayload,
  buildBridgeDomainPath,
  buildSubnetPath,
  l3OutAttachmentPayload,
  subnetPayload,
} from './paths'
import type { ParsedBridgeDomainL2Row, ParsedBridgeDomainL3Row } from './types'

const l2Row: ParsedBridgeDomainL2Row = {
  rowIndex: 1,
  tenant: 'TenantA',
  bd: 'BD-100',
  vrf: 'VRF-A',
  bd_desc: 'L2 only',
}

const l3Row: ParsedBridgeDomainL3Row = {
  rowIndex: 1,
  tenant: 'TenantA',
  bd: 'BD-200',
  vrf: 'VRF-A',
  bd_desc: 'L3 BD',
  subnet: '10.0.0.1/24',
  l3out: 'L3OUT-A',
}

describe('bridge domain paths', () => {
  it('builds bridge domain and subnet paths', () => {
    expect(buildBridgeDomainPath('TenantA', 'BD-100')).toBe('/api/node/mo/uni/tn-TenantA/BD-BD-100.json')
    expect(buildSubnetPath('TenantA', 'BD-200', '10.0.0.1/24')).toBe('/api/node/mo/uni/tn-TenantA/BD-BD-200/subnet-[10.0.0.1/24].json')
  })
})

describe('bridge domain payloads', () => {
  it('builds L2 only payload with required L2 attributes', () => {
    const payload = JSON.parse(bridgeDomainL2Payload(l2Row))
    expect(payload.fvBD.attributes).toMatchObject({
      unicastRoute: 'no',
      unkMacUcastAct: 'flood',
      arpFlood: 'true',
      name: 'BD-100',
      status: 'created,modified',
    })
    expect(payload.fvBD.children[0].fvRsCtx.attributes.tnFvCtxName).toBe('VRF-A')
  })

  it('builds L3 payload with subnet and L3Out payloads', () => {
    const bdPayload = JSON.parse(bridgeDomainL3Payload(l3Row))
    const subnetBody = JSON.parse(subnetPayload(l3Row))
    const l3outBody = JSON.parse(l3OutAttachmentPayload(l3Row))

    expect(bdPayload.fvBD.attributes).toMatchObject({
      unicastRoute: 'yes',
      unkMacUcastAct: 'proxy',
      arpFlood: 'false',
      status: 'created,modified',
    })
    expect(subnetBody.fvSubnet.attributes.ip).toBe('10.0.0.1/24')
    expect(subnetBody.fvSubnet.attributes.status).toBe('created,modified')
    expect(l3outBody.fvRsBDToOut.attributes.tnL3extOutName).toBe('L3OUT-A')
    expect(l3outBody.fvRsBDToOut.attributes.status).toBe('created,modified')
  })

  it('builds delete payload for bridge domain rollback', () => {
    const payload = JSON.parse(bridgeDomainDeletePayload(l2Row))
    expect(payload).toEqual({
      fvBD: {
        attributes: {
          dn: 'uni/tn-TenantA/BD-BD-100',
          status: 'deleted',
        },
        children: [],
      },
    })
  })
})
