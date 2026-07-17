import { describe, expect, it } from 'bun:test'
import {
  validateDeployRowsFromSnapshot,
  validateRollbackRowsFromSnapshot,
} from './apic'
import { buildEpgDn, buildMoDn, buildPathSegment } from './paths'
import {
  bindingLookupKey,
  type EpgBindingIndex,
  type SnapshotRead,
  type StaticPortSnapshot,
  type StaticPortSnapshotLoader,
  type StaticPortSnapshotRequirements,
} from './static-port-snapshot'
import type { ParsedRow } from './types'

const vpcRow: ParsedRow = {
  rowIndex: 1,
  tenant: 'TenantA',
  ap: 'AppA',
  epg: 'Web',
  vlan: 100,
  node1: 101,
  node2: 102,
  port_type: 'vpc',
  interface_or_ipg: 'WEB-VPC',
  mode: 'regular',
  immediacy: 'immediate',
}

const directRow: ParsedRow = {
  ...vpcRow,
  rowIndex: 2,
  epg: 'Direct',
  node2: null,
  port_type: 'port',
  interface_or_ipg: 'eth1/1',
}

function ok<T>(value: T): SnapshotRead<T> {
  return { ok: true, value }
}

function epgIndex(rows: ParsedRow[], bindingRows: ParsedRow[] = []): EpgBindingIndex {
  const index: EpgBindingIndex = {
    epgDns: new Set(rows.map(buildEpgDn)),
    bindingsByDn: new Map(),
    bindingDnsByPathAndEncap: new Map(),
  }

  for (const row of bindingRows) {
    const dn = buildMoDn(row)
    const tDn = buildPathSegment(row)
    const encap = `vlan-${row.vlan}`
    index.bindingsByDn.set(dn, { tDn, encap })
    index.bindingDnsByPathAndEncap.set(bindingLookupKey(tDn, encap), [dn])
  }
  return index
}

function snapshot(overrides: Partial<StaticPortSnapshot> = {}): StaticPortSnapshot {
  return {
    epgBindings: ok(epgIndex([vpcRow, directRow])),
    nodes: ok(new Set([101, 102])),
    bundles: ok(new Set(['WEB-VPC'])),
    physicalPaths: ok(new Set([buildPathSegment(directRow)])),
    ...overrides,
  }
}

function loaderFor(
  value: StaticPortSnapshot,
  calls: StaticPortSnapshotRequirements[] = [],
): StaticPortSnapshotLoader {
  return async (_host, _token, requirements) => {
    calls.push(requirements)
    return value
  }
}

describe('static-port snapshot validation', () => {
  it('returns deploy for an absent binding and exists for an exact binding', async () => {
    const index = epgIndex([vpcRow, directRow], [directRow])

    const results = await validateDeployRowsFromSnapshot(
      [vpcRow, directRow],
      'apic.local',
      'token',
      loaderFor(snapshot({ epgBindings: ok(index) })),
    )

    expect(results).toEqual([
      { rowIndex: 1, status: 'deploy' },
      { rowIndex: 2, status: 'exists' },
    ])
  })

  it('reports a different binding on the same path and VLAN as a conflict', async () => {
    const index = epgIndex([vpcRow])
    const conflictDn = `uni/tn-Other/ap-App/epg-Other/rspathAtt-[${buildPathSegment(vpcRow)}]`
    index.bindingsByDn.set(conflictDn, {
      tDn: buildPathSegment(vpcRow),
      encap: 'vlan-100',
    })
    index.bindingDnsByPathAndEncap.set(
      bindingLookupKey(buildPathSegment(vpcRow), 'vlan-100'),
      [conflictDn],
    )

    const [result] = await validateDeployRowsFromSnapshot(
      [vpcRow],
      'apic.local',
      'token',
      loaderFor(snapshot({ epgBindings: ok(index) })),
    )

    expect(result).toEqual({
      rowIndex: 1,
      status: 'error',
      message: `VLAN 100 already in use on this port by: ${conflictDn}`,
    })
  })

  it('preserves missing EPG, node, bundle, and physical-path errors in row order', async () => {
    const missingEpg = { ...vpcRow, rowIndex: 1, epg: 'Missing' }
    const missingNode = { ...vpcRow, rowIndex: 2, node2: 103 }
    const missingBundle = { ...vpcRow, rowIndex: 3, interface_or_ipg: 'MISSING-VPC' }
    const missingPhysical = { ...directRow, rowIndex: 4, interface_or_ipg: 'eth1/99' }
    const value = snapshot({
      epgBindings: ok(epgIndex([missingNode, missingBundle, missingPhysical])),
    })

    const results = await validateDeployRowsFromSnapshot(
      [missingEpg, missingNode, missingBundle, missingPhysical],
      'apic.local',
      'token',
      loaderFor(value),
    )

    expect(results).toEqual([
      { rowIndex: 1, status: 'error', message: 'EPG not found: TenantA/AppA/Missing' },
      { rowIndex: 2, status: 'error', message: 'Node(s) not found in fabric: 103' },
      { rowIndex: 3, status: 'error', message: 'Port/IPG not found in fabric: MISSING-VPC' },
      { rowIndex: 4, status: 'error', message: 'Port/IPG not found in fabric: eth1/99' },
    ])
  })

  it('returns rollback only for exact bindings', async () => {
    const index = epgIndex([vpcRow, directRow], [vpcRow])

    const results = await validateRollbackRowsFromSnapshot(
      [vpcRow, directRow],
      'apic.local',
      'token',
      loaderFor(snapshot({ epgBindings: ok(index) })),
    )

    expect(results).toEqual([
      { rowIndex: 1, status: 'rollback' },
      { rowIndex: 2, status: 'missing' },
    ])
  })

  it('turns snapshot failures into errors instead of false deploy results', async () => {
    const value = snapshot({
      epgBindings: { ok: false, status: 503, error: 'inventory unavailable' },
    })

    const [result] = await validateDeployRowsFromSnapshot(
      [vpcRow],
      'apic.local',
      'token',
      loaderFor(value),
    )

    expect(result).toEqual({
      rowIndex: 1,
      status: 'error',
      message: 'EPG/binding snapshot failed (APIC 503): inventory unavailable',
    })
  })

  it('loads one snapshot for 3,680 unique rows', async () => {
    const rows = Array.from({ length: 3_680 }, (_, index) => ({
      ...vpcRow,
      rowIndex: index + 1,
      epg: `Web-${index + 1}`,
    }))
    const requirementsCalls: StaticPortSnapshotRequirements[] = []
    const value = snapshot({ epgBindings: ok(epgIndex(rows)) })

    const results = await validateDeployRowsFromSnapshot(
      rows,
      'apic.local',
      'token',
      loaderFor(value, requirementsCalls),
    )

    expect(results).toHaveLength(3_680)
    expect(results.every(result => result.status === 'deploy')).toBe(true)
    expect(requirementsCalls).toHaveLength(1)
  })

  it('requests only inventories required by deploy row types', async () => {
    const calls: StaticPortSnapshotRequirements[] = []
    const loader = loaderFor(snapshot(), calls)

    await validateDeployRowsFromSnapshot([vpcRow], 'apic.local', 'token', loader)
    await validateDeployRowsFromSnapshot([directRow], 'apic.local', 'token', loader)

    expect(calls).toEqual([
      { nodes: true, bundles: true, physicalPaths: false },
      { nodes: true, bundles: false, physicalPaths: true },
    ])
  })

  it('requests only EPG and binding state for rollback', async () => {
    const calls: StaticPortSnapshotRequirements[] = []

    await validateRollbackRowsFromSnapshot(
      [vpcRow],
      'apic.local',
      'token',
      loaderFor(snapshot(), calls),
    )

    expect(calls).toEqual([{ nodes: false, bundles: false, physicalPaths: false }])
  })
})
