import { describe, expect, it, mock } from 'bun:test'
import * as XLSX from 'xlsx'
import { bdFixture } from '../../../tests/fixtures/bd'
mock.module('server-only', () => ({}))
const { buildBdWorkbook, serializeBdWorkbook, bdExportFilename } = await import('./export')
describe('BD Excel export', () => {
  it('round trips configuration, every subnet, and cross-tenant EPG identities', () => {
    const row = bdFixture({ description: '=1+1' })
    const book = XLSX.read(serializeBdWorkbook(buildBdWorkbook([row])), { type: 'array' })
    expect(book.SheetNames).toEqual(['Bridge Domains', 'Subnets', 'Connected EPGs'])
    const config = XLSX.utils.sheet_to_json(book.Sheets['Bridge Domains'])
    expect(config).toMatchObject([
      { 'Bridge Domain': 'web', 'EPG Count': 1, 'Routing Enabled': 'Yes', Description: '=1+1' },
    ])
    expect(book.Sheets['Bridge Domains'].G2.f).toBeUndefined()
    expect(XLSX.utils.sheet_to_json(book.Sheets.Subnets)).toHaveLength(2)
    expect(XLSX.utils.sheet_to_json(book.Sheets['Connected EPGs'])).toMatchObject([
      { 'BD Tenant': 'common', 'EPG Tenant': 'T1', 'EPG DN': 'uni/tn-T1/ap-app/epg-web' },
    ])
    expect(bdExportFilename('Fabric / One', 'filtered', new Date('2026-10-20T00:00:00Z'))).toBe(
      'bridge-domains-fabric-one-filtered-2026-10-20T00-00-00-000Z.xlsx',
    )
  })
})
