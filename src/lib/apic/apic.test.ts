import { describe, expect, it } from 'bun:test'
import { validateDeployRows, validateRollbackRows } from './apic'
import { createApicReader } from './read-cache'
import {
  buildEncapConflictQuery,
  buildMoPath,
  buildNodePath,
  buildPortPath,
} from './paths'
import type { ParsedRow } from './types'

const rows: ParsedRow[] = [
  {
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
  },
  {
    rowIndex: 2,
    tenant: 'TenantA',
    ap: 'AppA',
    epg: 'Api',
    vlan: 200,
    node1: 101,
    node2: 102,
    port_type: 'vpc',
    interface_or_ipg: 'WEB-VPC',
    mode: 'regular',
    immediacy: 'immediate',
  },
]

function countingReader() {
  const calls = new Map<string, number>()
  const reader = createApicReader('apic.local', 'token', async (_host, path) => {
    calls.set(path, (calls.get(path) ?? 0) + 1)
    const targetOrConflict = path.includes('fvRsPathAtt') || path.includes('/rspathAtt-[')
    return Response.json({ imdata: targetOrConflict ? [] : [{}] })
  })
  return { calls, reader }
}

describe('static-port APIC validation grouping', () => {
  it('reads shared nodes and IPGs once while preserving deploy results', async () => {
    const { calls, reader } = countingReader()

    const results = await validateDeployRows(rows, 'apic.local', 'token', reader)

    expect(results).toEqual([
      { rowIndex: 1, status: 'deploy' },
      { rowIndex: 2, status: 'deploy' },
    ])
    expect(calls.get(buildNodePath(101))).toBe(1)
    expect(calls.get(buildNodePath(102))).toBe(1)
    expect(calls.get(buildPortPath(rows[0]))).toBe(1)
    expect(calls.get(buildEncapConflictQuery(rows[0]))).toBe(1)
    expect(calls.get(buildEncapConflictQuery(rows[1]))).toBe(1)
    expect(calls.get(buildMoPath(rows[0]))).toBe(1)
    expect(calls.get(buildMoPath(rows[1]))).toBe(1)
  })

  it('deduplicates identical rollback targets within one review request', async () => {
    const duplicateRows = [rows[0], { ...rows[0], rowIndex: 2 }]
    const { calls, reader } = countingReader()

    const results = await validateRollbackRows(duplicateRows, 'apic.local', 'token', reader)

    expect(results).toEqual([
      { rowIndex: 1, status: 'missing' },
      { rowIndex: 2, status: 'missing' },
    ])
    expect(calls.get(buildMoPath(rows[0]))).toBe(1)
  })
})
