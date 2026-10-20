import { describe, expect, it } from 'bun:test'
import {
  buildEpgPageUrl,
  countActiveEpgFilterGroups,
  hasActiveEpgFilters,
  parseEpgPageParams,
} from './params'
import { buildEpgUrl } from '@/components/epgs/epg-url'
import { buildEpgExportPayload } from './export-utils'
import { epgExportSchema } from '@/lib/schemas/epg-export'

describe('parseEpgPageParams', () => {
  it('normalizes repeated/comma lists, trims, dedupes, and natural-sorts', () => {
    expect(
      parseEpgPageParams({
        apic: [' host-1 ', 'ignored'],
        view: 'port',
        query: ' web ',
        page: '3',
        pageSize: '100',
        tenant: ['T10,T2', 'T2'],
        ap: [' App2 ', 'App10,App2'],
        contract: [' Contract10,Contract2 ', 'Contract2', ''],
        node: ['1104,1103', '1103'],
      }),
    ).toEqual({
      hostId: 'host-1',
      view: 'port',
      query: 'web',
      page: 3,
      pageSize: 100,
      tenants: ['T2', 'T10'],
      appProfiles: ['App2', 'App10'],
      contracts: ['Contract2', 'Contract10'],
      nodes: ['1103', '1104'],
    })
  })

  it('defaults invalid scalar values and clears nodes for EPG view', () => {
    expect(parseEpgPageParams({ view: 'bad', page: '-2', pageSize: '20', node: '101' })).toEqual({
      hostId: '',
      view: 'epg',
      query: '',
      page: 1,
      pageSize: 50,
      tenants: [],
      appProfiles: [],
      contracts: [],
      nodes: [],
    })
  })

  it('supports all page size and emits a canonical URL', () => {
    expect(
      buildEpgPageUrl(
        parseEpgPageParams({
          apic: 'h 1',
          view: 'port',
          query: ' web ',
          page: '2',
          pageSize: 'all',
          tenant: 'T2,T1',
          ap: 'App2',
          contract: 'Contract2,Contract1',
          node: '102,101',
        }),
      ),
    ).toBe(
      '/epgs?apic=h+1&view=port&query=web&page=2&pageSize=all&tenant=T1%2CT2&ap=App2&contract=Contract1%2CContract2&node=101%2C102',
    )
  })
})

describe('contract filter workflow', () => {
  it('preserves contracts across view, pagination and other filter changes and supports clearing', () => {
    const params = parseEpgPageParams({ apic: 'h1', contract: 'web', page: '3' })
    expect(buildEpgUrl(params, { view: 'port', page: 1 })).toBe(
      '/epgs?apic=h1&view=port&contract=web',
    )
    expect(buildEpgUrl(params, { page: 4 })).toBe('/epgs?apic=h1&page=4&contract=web')
    expect(buildEpgUrl(params, { tenant: ['T1'], page: 1 })).toBe(
      '/epgs?apic=h1&tenant=T1&contract=web',
    )
    expect(buildEpgUrl(params, { contract: [], page: 1 })).toBe('/epgs?apic=h1')
    const portParams = parseEpgPageParams({
      apic: 'h1',
      view: 'port',
      node: '101',
      contract: 'web',
    })
    expect(buildEpgUrl(portParams, { view: 'epg', page: 1 })).toBe('/epgs?apic=h1&contract=web')
  })

  it('recognizes contracts as one active group and preserves them through export validation', () => {
    const filters = { contract: ['web', 'api'] }
    expect(hasActiveEpgFilters(filters)).toBe(true)
    expect(countActiveEpgFilterGroups(filters)).toBe(1)
    expect(hasActiveEpgFilters({ contract: [] })).toBe(false)
    const payload = buildEpgExportPayload({
      apicHostId: 'h1',
      scope: 'filtered',
      groupBy: 'port',
      filters,
    })
    expect(epgExportSchema.parse(payload).filters).toEqual(filters)
    expect(buildEpgExportPayload({ ...payload, scope: 'all', filters })).not.toHaveProperty(
      'filters',
    )
  })
})
