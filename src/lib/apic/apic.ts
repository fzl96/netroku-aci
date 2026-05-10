import { apicFetch } from './client'
import { buildMoPath, buildEpgPath, buildPortPath, buildNodePath, buildEncapConflictQuery, buildPathSegment } from './paths'
import { runParallel } from './parallel'
import type { ParsedRow, ValidationResult, DeployResult } from './types'

export async function validateDeployRows(
  rows: ParsedRow[],
  apicHost: string,
  apicToken: string,
): Promise<ValidationResult[]> {
  return runParallel<ParsedRow, ValidationResult>(rows, 10, async (row) => {
    try {
      const epgRes = await apicFetch(apicHost, buildEpgPath(row), { token: apicToken })
      if (epgRes.status === 404) {
        return { rowIndex: row.rowIndex, status: 'error', message: `EPG not found: ${row.tenant}/${row.ap}/${row.epg}` }
      }
      if (!epgRes.ok) {
        const text = await epgRes.text()
        return { rowIndex: row.rowIndex, status: 'error', message: `EPG check failed (APIC ${epgRes.status}): ${text.slice(0, 200)}` }
      }
      const epgData = await epgRes.json() as { imdata: unknown[] }
      if (epgData.imdata.length === 0) {
        return { rowIndex: row.rowIndex, status: 'error', message: `EPG not found: ${row.tenant}/${row.ap}/${row.epg}` }
      }

      const nodeIds = row.port_type === 'vpc' ? [row.node1, row.node2!] : [row.node1]
      const nodeChecks = await Promise.all(
        nodeIds.map(async (nodeId) => {
          const res = await apicFetch(apicHost, buildNodePath(nodeId), { token: apicToken })
          if (res.status === 404) return nodeId
          if (!res.ok) return nodeId
          const data = await res.json() as { imdata: unknown[] }
          return data.imdata.length === 0 ? nodeId : null
        })
      )
      const missingNodes = nodeChecks.filter((id): id is number => id !== null)
      if (missingNodes.length > 0) {
        return { rowIndex: row.rowIndex, status: 'error', message: `Node(s) not found in fabric: ${missingNodes.join(', ')}` }
      }

      const portRes = await apicFetch(apicHost, buildPortPath(row), { token: apicToken })
      if (portRes.status === 404) {
        return { rowIndex: row.rowIndex, status: 'error', message: `Port/IPG not found in fabric: ${row.interface_or_ipg}` }
      }
      if (!portRes.ok) {
        const text = await portRes.text()
        return { rowIndex: row.rowIndex, status: 'error', message: `Port check failed (APIC ${portRes.status}): ${text.slice(0, 200)}` }
      }
      const portData = await portRes.json() as { imdata: unknown[] }
      if (portData.imdata.length === 0) {
        return { rowIndex: row.rowIndex, status: 'error', message: `Port/IPG not found in fabric: ${row.interface_or_ipg}` }
      }

      const ourDn = `uni/tn-${row.tenant}/ap-${row.ap}/epg-${row.epg}/rspathAtt-[${buildPathSegment(row)}]`
      const conflictRes = await apicFetch(apicHost, buildEncapConflictQuery(row), { token: apicToken })
      if (conflictRes.ok) {
        const conflictData = await conflictRes.json() as { imdata: { fvRsPathAtt: { attributes: { dn: string } } }[] }
        const conflicts = conflictData.imdata.filter(item => item.fvRsPathAtt?.attributes?.dn !== ourDn)
        if (conflicts.length > 0) {
          const conflictDn = conflicts[0].fvRsPathAtt.attributes.dn
          return { rowIndex: row.rowIndex, status: 'error', message: `VLAN ${row.vlan} already in use on this port by: ${conflictDn}` }
        }
      }

      const res = await apicFetch(apicHost, buildMoPath(row), { token: apicToken })
      if (res.status === 404) return { rowIndex: row.rowIndex, status: 'deploy' }
      if (!res.ok) {
        const text = await res.text()
        return { rowIndex: row.rowIndex, status: 'error', message: `APIC ${res.status}: ${text.slice(0, 200)}` }
      }
      const data = await res.json() as { imdata: unknown[] }
      return { rowIndex: row.rowIndex, status: data.imdata.length > 0 ? 'exists' : 'deploy' }
    } catch (err) {
      return {
        rowIndex: row.rowIndex,
        status: 'error',
        message: err instanceof Error ? err.message : 'Network error',
      }
    }
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
): Promise<ValidationResult[]> {
  return runParallel<ParsedRow, ValidationResult>(rows, 10, async (row) => {
    try {
      const res = await apicFetch(apicHost, buildMoPath(row), { token: apicToken })
      if (res.status === 404) return { rowIndex: row.rowIndex, status: 'missing' }
      if (!res.ok) {
        const text = await res.text()
        return { rowIndex: row.rowIndex, status: 'error', message: `APIC ${res.status}: ${text.slice(0, 200)}` }
      }
      const data = await res.json() as { imdata: unknown[] }
      return { rowIndex: row.rowIndex, status: data.imdata.length === 0 ? 'missing' : 'rollback' }
    } catch (err) {
      return {
        rowIndex: row.rowIndex,
        status: 'error',
        message: err instanceof Error ? err.message : 'Network error',
      }
    }
  })
}
