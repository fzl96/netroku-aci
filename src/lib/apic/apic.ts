import { apicFetch } from './client'
import { buildEpgDn, buildMoDn, buildMoPath, buildPathSegment } from './paths'
import { runParallel } from './parallel'
import {
  bindingLookupKey,
  loadStaticPortSnapshot,
  type SnapshotRead,
  type StaticPortSnapshotLoader,
} from './static-port-snapshot'
import type { ParsedRow, ValidationResult, DeployResult } from './types'

function snapshotError<T>(result: SnapshotRead<T>, label: string): string | null {
  if (result.ok) return null
  if (result.status === 0) return result.error
  return `${label} snapshot failed (APIC ${result.status}): ${result.error}`
}

export async function validateDeployRows(
  rows: ParsedRow[],
  apicHost: string,
  apicToken: string,
  loadSnapshot: StaticPortSnapshotLoader = loadStaticPortSnapshot,
): Promise<ValidationResult[]> {
  const snapshot = await loadSnapshot(apicHost, apicToken, {
    nodes: true,
    bundles: rows.some(row => row.port_type === 'pc' || row.port_type === 'vpc'),
    physicalPaths: rows.some(row => row.port_type === 'port'),
  })

  return rows.map(row => {
    const epgError = snapshotError(snapshot.epgBindings, 'EPG/binding')
    if (epgError) return { rowIndex: row.rowIndex, status: 'error', message: epgError }
    if (!snapshot.epgBindings.ok) throw new Error('unreachable')
    const index = snapshot.epgBindings.value
    if (!index.epgDns.has(buildEpgDn(row))) {
      return { rowIndex: row.rowIndex, status: 'error', message: `EPG not found: ${row.tenant}/${row.ap}/${row.epg}` }
    }

    const nodeError = snapshotError(snapshot.nodes, 'Node')
    if (nodeError) return { rowIndex: row.rowIndex, status: 'error', message: nodeError }
    if (!snapshot.nodes.ok) throw new Error('unreachable')
    const nodeIds = row.port_type === 'vpc' ? [row.node1, row.node2!] : [row.node1]
    const missingNodes = nodeIds.filter(nodeId => !snapshot.nodes.value.has(nodeId))
    if (missingNodes.length > 0) {
      return { rowIndex: row.rowIndex, status: 'error', message: `Node(s) not found in fabric: ${missingNodes.join(', ')}` }
    }

    const portState = row.port_type === 'port' ? snapshot.physicalPaths : snapshot.bundles
    const portError = snapshotError(portState, 'Port')
    if (portError) return { rowIndex: row.rowIndex, status: 'error', message: portError }
    if (!portState.ok) throw new Error('unreachable')
    const portExists = row.port_type === 'port'
      ? portState.value.has(buildPathSegment(row))
      : portState.value.has(row.interface_or_ipg)
    if (!portExists) {
      return { rowIndex: row.rowIndex, status: 'error', message: `Port/IPG not found in fabric: ${row.interface_or_ipg}` }
    }

    const intendedDn = buildMoDn(row)
    const conflictDns = index.bindingDnsByPathAndEncap.get(
      bindingLookupKey(buildPathSegment(row), `vlan-${row.vlan}`),
    ) ?? []
    const conflictDn = conflictDns.find(dn => dn !== intendedDn)
    if (conflictDn) {
      return { rowIndex: row.rowIndex, status: 'error', message: `VLAN ${row.vlan} already in use on this port by: ${conflictDn}` }
    }

    return { rowIndex: row.rowIndex, status: index.bindingsByDn.has(intendedDn) ? 'exists' : 'deploy' }
  })
}

export async function deployRows(
  rows: ParsedRow[],
  apicHost: string,
  apicToken: string,
): Promise<DeployResult[]> {
  return runParallel<ParsedRow, DeployResult>(rows, 5, async (row) => {
    const moPath = buildMoPath(row)
    const dn = buildMoDn(row)
    const payload = JSON.stringify({
      fvRsPathAtt: {
        attributes: { dn, encap: `vlan-${row.vlan}`, mode: row.mode, instrImedcy: row.immediacy },
      },
    })
    try {
      const res = await apicFetch(apicHost, moPath, { method: 'POST', body: payload, token: apicToken })
      if (!res.ok) {
        const text = await res.text()
        return { rowIndex: row.rowIndex, success: false, message: `APIC ${res.status}: ${text.slice(0, 200)}` }
      }
      return { rowIndex: row.rowIndex, success: true }
    } catch (err) {
      return {
        rowIndex: row.rowIndex,
        success: false,
        message: err instanceof Error ? err.message : 'Network error',
      }
    }
  })
}

export async function rollbackRows(
  rows: ParsedRow[],
  apicHost: string,
  apicToken: string,
): Promise<DeployResult[]> {
  return runParallel<ParsedRow, DeployResult>(rows, 5, async (row) => {
    const moPath = buildMoPath(row)
    const dn = buildMoDn(row)
    const payload = JSON.stringify({
      fvRsPathAtt: { attributes: { dn, status: 'deleted' } },
    })
    try {
      const res = await apicFetch(apicHost, moPath, { method: 'POST', body: payload, token: apicToken })
      if (!res.ok) {
        const text = await res.text()
        return { rowIndex: row.rowIndex, success: false, message: `APIC ${res.status}: ${text.slice(0, 200)}` }
      }
      return { rowIndex: row.rowIndex, success: true }
    } catch (err) {
      return {
        rowIndex: row.rowIndex,
        success: false,
        message: err instanceof Error ? err.message : 'Network error',
      }
    }
  })
}

export async function validateRollbackRows(
  rows: ParsedRow[],
  apicHost: string,
  apicToken: string,
  loadSnapshot: StaticPortSnapshotLoader = loadStaticPortSnapshot,
): Promise<ValidationResult[]> {
  const snapshot = await loadSnapshot(apicHost, apicToken, {
    nodes: false,
    bundles: false,
    physicalPaths: false,
  })

  return rows.map(row => {
    const error = snapshotError(snapshot.epgBindings, 'EPG/binding')
    if (error) return { rowIndex: row.rowIndex, status: 'error', message: error }
    if (!snapshot.epgBindings.ok) throw new Error('unreachable')
    return {
      rowIndex: row.rowIndex,
      status: snapshot.epgBindings.value.bindingsByDn.has(buildMoDn(row)) ? 'rollback' : 'missing',
    }
  })
}
