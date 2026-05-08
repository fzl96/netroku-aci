import { describe, expect, it } from 'bun:test'
import {
  validateL2RollbackState,
  validateL3RollbackState,
  type BridgeDomainAttrs,
  type BridgeDomainChild,
} from './rollback'
import type { ParsedBridgeDomainL2Row, ParsedBridgeDomainL3Row } from './types'

const l2Row: ParsedBridgeDomainL2Row = {
  rowIndex: 1,
  tenant: 'TenantA',
  bd: 'BD-100',
  vrf: 'VRF-A',
}

const l3Row: ParsedBridgeDomainL3Row = {
  ...l2Row,
  subnet: '10.0.0.1/24',
  l3out: 'WAN-L3OUT',
}

const l2Attrs: BridgeDomainAttrs = {
  unicastRoute: 'no',
  unkMacUcastAct: 'flood',
  arpFlood: 'true',
}

const l3Attrs: BridgeDomainAttrs = {
  unicastRoute: 'yes',
  unkMacUcastAct: 'proxy',
  arpFlood: 'false',
}

const ctxChild: BridgeDomainChild = {
  fvRsCtx: { attributes: { tnFvCtxName: 'VRF-A' } },
}

describe('validateL2RollbackState', () => {
  it('accepts matching L2 bridge domain state', () => {
    expect(validateL2RollbackState(l2Row, l2Attrs, [ctxChild])).toBeNull()
  })

  it('rejects L2 rollback when BD has L3 children', () => {
    expect(validateL2RollbackState(l2Row, l2Attrs, [
      ctxChild,
      { fvSubnet: { attributes: { ip: '10.0.0.1/24' } } },
    ])).toContain('has subnet or L3Out children')
  })

  it('rejects VRF mismatch', () => {
    expect(validateL2RollbackState(l2Row, l2Attrs, [
      { fvRsCtx: { attributes: { tnFvCtxName: 'OTHER-VRF' } } },
    ])).toContain('exists with VRF OTHER-VRF')
  })
})

describe('validateL3RollbackState', () => {
  it('accepts matching L3 bridge domain state', () => {
    expect(validateL3RollbackState(l3Row, l3Attrs, [
      ctxChild,
      { fvSubnet: { attributes: { ip: '10.0.0.1/24' } } },
      { fvRsBDToOut: { attributes: { tnL3extOutName: 'WAN-L3OUT' } } },
    ])).toBeNull()
  })

  it('rejects missing subnet', () => {
    expect(validateL3RollbackState(l3Row, l3Attrs, [
      ctxChild,
      { fvRsBDToOut: { attributes: { tnL3extOutName: 'WAN-L3OUT' } } },
    ])).toContain('missing subnet')
  })

  it('rejects non-L3 bridge domain attributes', () => {
    expect(validateL3RollbackState(l3Row, l2Attrs, [
      ctxChild,
      { fvSubnet: { attributes: { ip: '10.0.0.1/24' } } },
      { fvRsBDToOut: { attributes: { tnL3extOutName: 'WAN-L3OUT' } } },
    ])).toContain('is not L3')
  })
})
