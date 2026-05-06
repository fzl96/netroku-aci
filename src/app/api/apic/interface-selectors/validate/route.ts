import { apicFetch } from '@/lib/apic/client'
import {
  buildProfilePath,
  buildIpgPath,
  buildIpgDn,
  buildSelectorChildrenPath,
  buildProfilePortBlksQuery,
} from '@/lib/apic/selectors/paths'
import { runParallel } from '@/lib/apic/parallel'
import type {
  ParsedSelectorRow,
  SelectorValidationResult,
} from '@/lib/apic/selectors/types'

interface PortBlkAttrs {
  dn: string
  fromCard: string
  toCard: string
  fromPort: string
  toPort: string
}

export async function POST(request: Request): Promise<Response> {
  let rows: ParsedSelectorRow[], apicHost: string, apicToken: string
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

  const results = await runParallel<ParsedSelectorRow, SelectorValidationResult>(rows, 10, async (row) => {
    try {
      // Step 1: profile exists
      const profRes = await apicFetch(host, buildProfilePath(row.interface_profile), { token })
      if (profRes.status === 404) {
        return { rowIndex: row.rowIndex, status: 'error', message: `Interface profile not found: ${row.interface_profile}` }
      }
      if (!profRes.ok) {
        const text = await profRes.text()
        return { rowIndex: row.rowIndex, status: 'error', message: `Profile check failed (APIC ${profRes.status}): ${text.slice(0, 200)}` }
      }
      const profData = await profRes.json() as { imdata: unknown[] }
      if (profData.imdata.length === 0) {
        return { rowIndex: row.rowIndex, status: 'error', message: `Interface profile not found: ${row.interface_profile}` }
      }

      // Step 2: IPG exists at the correct DN for the declared type
      const ipgRes = await apicFetch(host, buildIpgPath(row.ipg_type, row.ipg_name), { token })
      if (ipgRes.status === 404) {
        return { rowIndex: row.rowIndex, status: 'error', message: `IPG not found (${row.ipg_type}): ${row.ipg_name}` }
      }
      if (!ipgRes.ok) {
        const text = await ipgRes.text()
        return { rowIndex: row.rowIndex, status: 'error', message: `IPG check failed (APIC ${ipgRes.status}): ${text.slice(0, 200)}` }
      }
      const ipgData = await ipgRes.json() as { imdata: unknown[] }
      if (ipgData.imdata.length === 0) {
        return { rowIndex: row.rowIndex, status: 'error', message: `IPG not found (${row.ipg_type}): ${row.ipg_name}` }
      }

      // Step 3+4+5: load the selector children (port blocks + IPG ref) if it exists,
      // and load all port blocks under the profile to detect cross-selector conflicts.
      const [selRes, blksRes] = await Promise.all([
        apicFetch(host, buildSelectorChildrenPath(row.interface_profile, row.selector_name), { token }),
        apicFetch(host, buildProfilePortBlksQuery(row.interface_profile), { token }),
      ])

      // All port blocks under this profile, keyed by parent selector DN.
      let allBlks: { dn: string; fromCard: number; toCard: number; fromPort: number; toPort: number; selectorDn: string }[] = []
      if (blksRes.ok) {
        const blksData = await blksRes.json() as { imdata: { infraPortBlk: { attributes: PortBlkAttrs } }[] }
        allBlks = blksData.imdata
          .map(item => item.infraPortBlk?.attributes)
          .filter((a): a is PortBlkAttrs => !!a)
          .map(a => ({
            dn: a.dn,
            fromCard: parseInt(a.fromCard, 10),
            toCard: parseInt(a.toCard, 10),
            fromPort: parseInt(a.fromPort, 10),
            toPort: parseInt(a.toPort, 10),
            selectorDn: a.dn.replace(/\/portblk-[^/]+$/, ''),
          }))
      }

      const ourSelectorDn = `uni/infra/accportprof-${row.interface_profile}/hports-${row.selector_name}-typ-range`
      const conflictingBlk = allBlks.find(b =>
        b.selectorDn !== ourSelectorDn &&
        row.card >= b.fromCard && row.card <= b.toCard &&
        row.port_num >= b.fromPort && row.port_num <= b.toPort
      )
      if (conflictingBlk) {
        return {
          rowIndex: row.rowIndex,
          status: 'error',
          message: `Port ${row.card}/${row.port_num} already claimed by another selector: ${conflictingBlk.selectorDn}`,
        }
      }

      // Selector existence + idempotency check
      if (selRes.status === 404) {
        return { rowIndex: row.rowIndex, status: 'deploy' }
      }
      if (!selRes.ok) {
        const text = await selRes.text()
        return { rowIndex: row.rowIndex, status: 'error', message: `Selector check failed (APIC ${selRes.status}): ${text.slice(0, 200)}` }
      }
      const selData = await selRes.json() as {
        imdata: (
          | { infraPortBlk: { attributes: PortBlkAttrs } }
          | { infraRsAccBaseGrp: { attributes: { tDn: string } } }
        )[]
      }

      if (selData.imdata.length === 0) {
        // Selector itself doesn't exist (children query returns empty when parent missing)
        return { rowIndex: row.rowIndex, status: 'deploy' }
      }

      // Selector exists — check whether it matches our intent exactly.
      const existingBlks = selData.imdata
        .map(item => 'infraPortBlk' in item ? item.infraPortBlk.attributes : null)
        .filter((a): a is PortBlkAttrs => a !== null)
      const existingRef = selData.imdata
        .map(item => 'infraRsAccBaseGrp' in item ? item.infraRsAccBaseGrp.attributes.tDn : null)
        .find((tDn): tDn is string => tDn !== null)

      const expectedTDn = buildIpgDn(row.ipg_type, row.ipg_name)
      const portMatches = existingBlks.some(b =>
        parseInt(b.fromCard, 10) === row.card &&
        parseInt(b.toCard, 10) === row.card &&
        parseInt(b.fromPort, 10) === row.port_num &&
        parseInt(b.toPort, 10) === row.port_num
      )

      if (portMatches && existingRef === expectedTDn) {
        return { rowIndex: row.rowIndex, status: 'exists' }
      }

      return {
        rowIndex: row.rowIndex,
        status: 'error',
        message: `Selector ${row.selector_name} already exists on profile ${row.interface_profile} with different port/IPG`,
      }
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
