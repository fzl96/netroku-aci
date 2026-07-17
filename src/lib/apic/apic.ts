import { apicFetch } from './client'
import { buildMoPath, buildEpgPath, buildPortPath, buildNodePath, buildEncapConflictQuery, buildPathSegment } from './paths'
import { runParallel } from './parallel'
import { createApicReader, type ApicGetResult, type ApicReader } from './read-cache'
import type { ParsedRow, ValidationResult, DeployResult } from './types'

type Imdata<T = unknown> = { imdata: T[] }

function networkError(result: ApicGetResult<unknown>): string | null {
  return !result.ok && result.status === 0 ? result.error : null
}

export async function validateDeployRows(
  rows: ParsedRow[],
  apicHost: string,
  apicToken: string,
  reader: ApicReader = createApicReader(apicHost, apicToken),
): Promise<ValidationResult[]> {
  const epgStates = await reader.getMany<Imdata>(rows.map(buildEpgPath))
  const epgEligibleRows = rows.filter(row => {
    const state = epgStates.get(buildEpgPath(row))
    return state?.ok === true && state.data.imdata.length > 0
  })

  const nodeStates = await reader.getMany<Imdata>(epgEligibleRows.flatMap(row =>
    (row.port_type === 'vpc' ? [row.node1, row.node2!] : [row.node1]).map(buildNodePath)
  ))
  const nodeEligibleRows = epgEligibleRows.filter(row => {
    const nodeIds = row.port_type === 'vpc' ? [row.node1, row.node2!] : [row.node1]
    return nodeIds.every(nodeId => {
      const state = nodeStates.get(buildNodePath(nodeId))
      return state?.ok === true && state.data.imdata.length > 0
    })
  })

  const portStates = await reader.getMany<Imdata>(nodeEligibleRows.map(buildPortPath))
  const portEligibleRows = nodeEligibleRows.filter(row => {
    const state = portStates.get(buildPortPath(row))
    return state?.ok === true && state.data.imdata.length > 0
  })

  type ConflictData = Imdata<{ fvRsPathAtt: { attributes: { dn: string } } }>
  const conflictStates = await reader.getMany<ConflictData>(portEligibleRows.map(buildEncapConflictQuery))
  const targetEligibleRows = portEligibleRows.filter(row => {
    const state = conflictStates.get(buildEncapConflictQuery(row))
    if (!state?.ok) return state?.status !== 0
    const ourDn = `uni/tn-${row.tenant}/ap-${row.ap}/epg-${row.epg}/rspathAtt-[${buildPathSegment(row)}]`
    return !state.data.imdata.some(item => item.fvRsPathAtt?.attributes?.dn !== ourDn)
  })
  const targetStates = await reader.getMany<Imdata>(targetEligibleRows.map(buildMoPath))

  return rows.map(row => {
    const epgState = epgStates.get(buildEpgPath(row))!
    const epgNetworkError = networkError(epgState)
    if (epgNetworkError) return { rowIndex: row.rowIndex, status: 'error', message: epgNetworkError }
    if (epgState.status === 404 || (epgState.ok && epgState.data.imdata.length === 0)) {
      return { rowIndex: row.rowIndex, status: 'error', message: `EPG not found: ${row.tenant}/${row.ap}/${row.epg}` }
    }
    if (!epgState.ok) {
      return { rowIndex: row.rowIndex, status: 'error', message: `EPG check failed (APIC ${epgState.status}): ${epgState.error}` }
    }

    const nodeIds = row.port_type === 'vpc' ? [row.node1, row.node2!] : [row.node1]
    const nodeNetworkError = nodeIds
      .map(nodeId => networkError(nodeStates.get(buildNodePath(nodeId))!))
      .find((message): message is string => message !== null)
    if (nodeNetworkError) return { rowIndex: row.rowIndex, status: 'error', message: nodeNetworkError }
    const missingNodes = nodeIds.filter(nodeId => {
      const state = nodeStates.get(buildNodePath(nodeId))!
      return !state.ok || state.data.imdata.length === 0
    })
    if (missingNodes.length > 0) {
      return { rowIndex: row.rowIndex, status: 'error', message: `Node(s) not found in fabric: ${missingNodes.join(', ')}` }
    }

    const portState = portStates.get(buildPortPath(row))!
    const portNetworkError = networkError(portState)
    if (portNetworkError) return { rowIndex: row.rowIndex, status: 'error', message: portNetworkError }
    if (portState.status === 404 || (portState.ok && portState.data.imdata.length === 0)) {
      return { rowIndex: row.rowIndex, status: 'error', message: `Port/IPG not found in fabric: ${row.interface_or_ipg}` }
    }
    if (!portState.ok) {
      return { rowIndex: row.rowIndex, status: 'error', message: `Port check failed (APIC ${portState.status}): ${portState.error}` }
    }

    const conflictState = conflictStates.get(buildEncapConflictQuery(row))!
    const conflictNetworkError = networkError(conflictState)
    if (conflictNetworkError) return { rowIndex: row.rowIndex, status: 'error', message: conflictNetworkError }
    if (conflictState.ok) {
      const ourDn = `uni/tn-${row.tenant}/ap-${row.ap}/epg-${row.epg}/rspathAtt-[${buildPathSegment(row)}]`
      const conflict = conflictState.data.imdata.find(item => item.fvRsPathAtt?.attributes?.dn !== ourDn)
      if (conflict) {
        return { rowIndex: row.rowIndex, status: 'error', message: `VLAN ${row.vlan} already in use on this port by: ${conflict.fvRsPathAtt.attributes.dn}` }
      }
    }

    const targetState = targetStates.get(buildMoPath(row))!
    const targetNetworkError = networkError(targetState)
    if (targetNetworkError) return { rowIndex: row.rowIndex, status: 'error', message: targetNetworkError }
    if (targetState.status === 404) return { rowIndex: row.rowIndex, status: 'deploy' }
    if (!targetState.ok) {
      return { rowIndex: row.rowIndex, status: 'error', message: `APIC ${targetState.status}: ${targetState.error}` }
    }
    return { rowIndex: row.rowIndex, status: targetState.data.imdata.length > 0 ? 'exists' : 'deploy' }
  })
}

export async function deployRows(
  rows: ParsedRow[],
  apicHost: string,
  apicToken: string,
): Promise<DeployResult[]> {
  return runParallel<ParsedRow, DeployResult>(rows, 5, async (row) => {
    const moPath = buildMoPath(row)
    const pathSeg = buildPathSegment(row)
    const dn = `uni/tn-${row.tenant}/ap-${row.ap}/epg-${row.epg}/rspathAtt-[${pathSeg}]`
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
    const pathSeg = buildPathSegment(row)
    const dn = `uni/tn-${row.tenant}/ap-${row.ap}/epg-${row.epg}/rspathAtt-[${pathSeg}]`
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
  reader: ApicReader = createApicReader(apicHost, apicToken),
): Promise<ValidationResult[]> {
  const targetStates = await reader.getMany<Imdata>(rows.map(buildMoPath))
  return rows.map(row => {
    const state = targetStates.get(buildMoPath(row))!
    const error = networkError(state)
    if (error) return { rowIndex: row.rowIndex, status: 'error', message: error }
    if (state.status === 404) return { rowIndex: row.rowIndex, status: 'missing' }
    if (!state.ok) return { rowIndex: row.rowIndex, status: 'error', message: `APIC ${state.status}: ${state.error}` }
    return { rowIndex: row.rowIndex, status: state.data.imdata.length === 0 ? 'missing' : 'rollback' }
  })
}
