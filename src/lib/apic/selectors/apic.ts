import { apicFetch } from '@/lib/apic/client'
import { runParallel } from '@/lib/apic/parallel'
import {
  buildProfilePath,
  buildIpgPath,
  buildIpgDn,
  buildSelectorChildrenPath,
  buildProfilePortBlksQuery,
  buildSelectorPath,
  selectorDeployPayload,
  selectorDeletePayload,
} from './paths'
import type { ParsedSelectorRow, SelectorDeployResult, SelectorValidationResult } from './types'

interface PortBlkAttrs {
  dn: string
  fromCard: string
  toCard: string
  fromPort: string
  toPort: string
}

export async function validateSelectorDeployRows(
  rows: ParsedSelectorRow[],
  apicHost: string,
  apicToken: string,
): Promise<SelectorValidationResult[]> {
  return runParallel<ParsedSelectorRow, SelectorValidationResult>(rows, 10, async (row) => {
    try {
      const profRes = await apicFetch(apicHost, buildProfilePath(row.interface_profile), { token: apicToken })
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

      const ipgRes = await apicFetch(apicHost, buildIpgPath(row.ipg_type, row.ipg_name), { token: apicToken })
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

      const [selRes, blksRes] = await Promise.all([
        apicFetch(apicHost, buildSelectorChildrenPath(row.interface_profile, row.selector_name), { token: apicToken }),
        apicFetch(apicHost, buildProfilePortBlksQuery(row.interface_profile), { token: apicToken }),
      ])

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
        return { rowIndex: row.rowIndex, status: 'deploy' }
      }

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
}

export async function deploySelectorRows(
  rows: ParsedSelectorRow[],
  apicHost: string,
  apicToken: string,
): Promise<SelectorDeployResult[]> {
  return runParallel<ParsedSelectorRow, SelectorDeployResult>(rows, 5, async (row) => {
    try {
      const res = await apicFetch(apicHost, buildSelectorPath(row.interface_profile, row.selector_name), {
        method: 'POST',
        body: selectorDeployPayload(row),
        token: apicToken,
      })
      if (!res.ok) {
        const text = await res.text()
        return { rowIndex: row.rowIndex, success: false, message: `APIC ${res.status}: ${text.slice(0, 200)}` }
      }
      return { rowIndex: row.rowIndex, success: true }
    } catch (err) {
      return { rowIndex: row.rowIndex, success: false, message: err instanceof Error ? err.message : 'Network error' }
    }
  })
}

export async function rollbackSelectorRows(
  rows: ParsedSelectorRow[],
  apicHost: string,
  apicToken: string,
): Promise<SelectorDeployResult[]> {
  return runParallel<ParsedSelectorRow, SelectorDeployResult>(rows, 5, async (row) => {
    try {
      const res = await apicFetch(apicHost, buildSelectorPath(row.interface_profile, row.selector_name), {
        method: 'POST',
        body: selectorDeletePayload(row),
        token: apicToken,
      })
      if (!res.ok) {
        const text = await res.text()
        return { rowIndex: row.rowIndex, success: false, message: `APIC ${res.status}: ${text.slice(0, 200)}` }
      }
      return { rowIndex: row.rowIndex, success: true }
    } catch (err) {
      return { rowIndex: row.rowIndex, success: false, message: err instanceof Error ? err.message : 'Network error' }
    }
  })
}

export async function validateSelectorRollbackRows(
  rows: ParsedSelectorRow[],
  apicHost: string,
  apicToken: string,
): Promise<SelectorValidationResult[]> {
  return runParallel<ParsedSelectorRow, SelectorValidationResult>(rows, 10, async (row) => {
    try {
      const res = await apicFetch(apicHost, buildSelectorPath(row.interface_profile, row.selector_name), { token: apicToken })
      if (res.status === 404) return { rowIndex: row.rowIndex, status: 'missing' }
      if (!res.ok) {
        const text = await res.text()
        return { rowIndex: row.rowIndex, status: 'error', message: `APIC ${res.status}: ${text.slice(0, 200)}` }
      }
      const data = await res.json() as { imdata: unknown[] }
      return { rowIndex: row.rowIndex, status: data.imdata.length === 0 ? 'missing' : 'rollback' }
    } catch (err) {
      return { rowIndex: row.rowIndex, status: 'error', message: err instanceof Error ? err.message : 'Network error' }
    }
  })
}
