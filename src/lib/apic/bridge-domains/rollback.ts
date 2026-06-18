import type {
  ParsedBridgeDomainL2Row,
  ParsedBridgeDomainL3Row,
} from './types'

export interface BridgeDomainAttrs {
  arpFlood?: string
  dn?: string
  unicastRoute?: string
  unkMacUcastAct?: string
}

export type BridgeDomainChild =
  | { fvSubnet: { attributes: { ip?: string } } }
  | { fvRsBDToOut: { attributes: { tnL3extOutName?: string } } }
  | { fvRsCtx: { attributes: { tDn?: string; tnFvCtxName?: string } } }

function normalizedBoolean(value: string | undefined): string | undefined {
  if (value === 'yes') return 'true'
  if (value === 'no') return 'false'
  return value
}

function vrfName(children: BridgeDomainChild[]): string | undefined {
  const ctx = children.find((item): item is { fvRsCtx: { attributes: { tDn?: string; tnFvCtxName?: string } } } =>
    'fvRsCtx' in item
  )
  return ctx?.fvRsCtx.attributes.tnFvCtxName ?? ctx?.fvRsCtx.attributes.tDn?.split('/ctx-')[1]
}

function hasSubnet(children: BridgeDomainChild[], subnet: string): boolean {
  return children.some((item) =>
    'fvSubnet' in item && item.fvSubnet.attributes.ip === subnet
  )
}

function hasL3Out(children: BridgeDomainChild[], l3out: string): boolean {
  return children.some((item) =>
    'fvRsBDToOut' in item && item.fvRsBDToOut.attributes.tnL3extOutName === l3out
  )
}

function hasAnyL3Child(children: BridgeDomainChild[]): boolean {
  return children.some((item) => 'fvSubnet' in item || 'fvRsBDToOut' in item)
}

function validateCommonVrf(row: { tenant: string; bd: string; vrf: string }, children: BridgeDomainChild[]): string | null {
  const existingVrf = vrfName(children)
  if (existingVrf && existingVrf !== row.vrf) {
    return `Bridge domain ${row.tenant}/${row.bd} exists with VRF ${existingVrf}, not ${row.vrf}`
  }
  return null
}

export function validateL2RollbackState(
  row: ParsedBridgeDomainL2Row,
  attrs: BridgeDomainAttrs,
  children: BridgeDomainChild[],
): string | null {
  const vrfError = validateCommonVrf(row, children)
  if (vrfError) return vrfError

  if (attrs.unicastRoute !== 'no') {
    return `Bridge domain ${row.tenant}/${row.bd} is not L2 Only: unicastRoute is ${attrs.unicastRoute ?? 'unset'}`
  }
  if (attrs.unkMacUcastAct !== 'flood') {
    return `Bridge domain ${row.tenant}/${row.bd} is not L2 Only: unkMacUcastAct is ${attrs.unkMacUcastAct ?? 'unset'}`
  }
  if (normalizedBoolean(attrs.arpFlood) !== 'true') {
    return `Bridge domain ${row.tenant}/${row.bd} is not L2 Only: arpFlood is ${attrs.arpFlood ?? 'unset'}`
  }
  if (hasAnyL3Child(children)) {
    return `Bridge domain ${row.tenant}/${row.bd} has subnet or L3Out children; use L3 rollback instead`
  }

  return null
}

export function validateL3RollbackState(
  row: ParsedBridgeDomainL3Row,
  attrs: BridgeDomainAttrs,
  children: BridgeDomainChild[],
): string | null {
  const vrfError = validateCommonVrf(row, children)
  if (vrfError) return vrfError

  if (attrs.unicastRoute !== 'yes') {
    return `Bridge domain ${row.tenant}/${row.bd} is not L3: unicastRoute is ${attrs.unicastRoute ?? 'unset'}`
  }
  if (attrs.unkMacUcastAct !== 'proxy') {
    return `Bridge domain ${row.tenant}/${row.bd} is not L3: unkMacUcastAct is ${attrs.unkMacUcastAct ?? 'unset'}`
  }
  if (normalizedBoolean(attrs.arpFlood) !== 'false') {
    return `Bridge domain ${row.tenant}/${row.bd} is not L3: arpFlood is ${attrs.arpFlood ?? 'unset'}`
  }
  if (!hasSubnet(children, row.subnet)) {
    return `Bridge domain ${row.tenant}/${row.bd} is missing subnet ${row.subnet}`
  }
  if (!hasL3Out(children, row.l3out)) {
    return `Bridge domain ${row.tenant}/${row.bd} is missing L3Out attachment ${row.l3out}`
  }

  return null
}
