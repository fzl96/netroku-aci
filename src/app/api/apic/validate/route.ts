// src/app/api/apic/validate/route.ts
import { apicFetch } from '@/lib/apic/client'
import { buildMoPath, buildEpgPath, buildPortPath, buildNodePath, buildEncapConflictQuery, buildPathSegment } from '@/lib/apic/paths'
import { runParallel } from '@/lib/apic/parallel'
import type { ParsedRow, ValidationResult } from '@/lib/apic/types'

export async function POST(request: Request): Promise<Response> {
  let rows: ParsedRow[], apicHost: string, apicToken: string
  try {
    ;({ rows, apicHost, apicToken } = await request.json())
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!Array.isArray(rows)) {
    return Response.json({ error: 'rows is required' }, { status: 400 })
  }
  if (!apicHost || !apicToken) {
    return Response.json({ error: 'apicHost and apicToken are required' }, { status: 400 })
  }

  const host = apicHost
  const token = apicToken

  const results = await runParallel<ParsedRow, ValidationResult>(rows, 10, async (row) => {
    try {
      // Step 1: check EPG exists
      const epgRes = await apicFetch(host, buildEpgPath(row), { token })
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

      // Step 2: check leaf nodes registered in fabric
      const nodeIds = row.port_type === 'vpc' ? [row.node1, row.node2!] : [row.node1]
      const nodeChecks = await Promise.all(
        nodeIds.map(async (nodeId) => {
          const res = await apicFetch(host, buildNodePath(nodeId), { token })
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

      // Step 3: check port/IPG exists in fabric
      const portRes = await apicFetch(host, buildPortPath(row), { token })
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

      // Step 4: check VLAN encap not already in use on this port by a different EPG
      const ourDn = `uni/tn-${row.tenant}/ap-${row.ap}/epg-${row.epg}/rspathAtt-[${buildPathSegment(row)}]`
      const conflictRes = await apicFetch(host, buildEncapConflictQuery(row), { token })
      if (conflictRes.ok) {
        const conflictData = await conflictRes.json() as { imdata: { fvRsPathAtt: { attributes: { dn: string } } }[] }
        const conflicts = conflictData.imdata.filter(item => item.fvRsPathAtt?.attributes?.dn !== ourDn)
        if (conflicts.length > 0) {
          const conflictDn = conflicts[0].fvRsPathAtt.attributes.dn
          return { rowIndex: row.rowIndex, status: 'error', message: `VLAN ${row.vlan} already in use on this port by: ${conflictDn}` }
        }
      }

      // Step 5: check static port binding exists
      const res = await apicFetch(host, buildMoPath(row), { token })
      if (res.status === 404) {
        return { rowIndex: row.rowIndex, status: 'deploy' }
      }
      if (!res.ok) {
        const text = await res.text()
        return { rowIndex: row.rowIndex, status: 'error', message: `APIC ${res.status}: ${text.slice(0, 200)}` }
      }
      const data = await res.json() as { imdata: unknown[] }
      if (data.imdata.length > 0) {
        return { rowIndex: row.rowIndex, status: 'exists' }
      }

      return { rowIndex: row.rowIndex, status: 'deploy' }
    } catch (err) {
      return {
        rowIndex: row.rowIndex,
        status: 'error',
        message: err instanceof Error ? err.message : 'Network error',
      }
    }
  })

  return Response.json({ results })
}
