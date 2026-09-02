import { describe, expect, it } from 'bun:test'
import { buildEpgPageUrl, parseEpgPageParams } from './params'

describe('parseEpgPageParams', () => {
  it('normalizes repeated/comma lists, trims, dedupes, and natural-sorts', () => {
    expect(parseEpgPageParams({
      apic: [' host-1 ', 'ignored'],
      view: 'port',
      query: ' web ',
      page: '3',
      pageSize: '100',
      tenant: ['T10,T2', 'T2'],
      ap: [' App2 ', 'App10,App2'],
      node: ['1104,1103', '1103'],
    })).toEqual({
      hostId: 'host-1', view: 'port', query: 'web', page: 3, pageSize: 100,
      tenants: ['T2', 'T10'], appProfiles: ['App2', 'App10'], nodes: ['1103', '1104'],
    })
  })

  it('defaults invalid scalar values and clears nodes for EPG view', () => {
    expect(parseEpgPageParams({ view: 'bad', page: '-2', pageSize: '20', node: '101' }))
      .toEqual({ hostId: '', view: 'epg', query: '', page: 1, pageSize: 50, tenants: [], appProfiles: [], nodes: [] })
  })

  it('supports all page size and emits a canonical URL', () => {
    expect(buildEpgPageUrl(parseEpgPageParams({
      apic: 'h 1', view: 'port', query: ' web ', page: '2', pageSize: 'all',
      tenant: 'T2,T1', ap: 'App2', node: '102,101',
    }))).toBe('/epgs?apic=h+1&view=port&query=web&page=2&pageSize=all&tenant=T1%2CT2&ap=App2&node=101%2C102')
  })
})
