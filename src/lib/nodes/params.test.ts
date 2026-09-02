import { describe, expect, it } from 'bun:test'
import { buildNodePageUrl, parseNodePageParams } from './params'

describe('parseNodePageParams', () => {
  it('normalizes raw framework parameters once', () => {
    expect(parseNodePageParams({
      apic: [' host-1 ', 'ignored'], query: ' leaf ', view: 'components',
      role: 'spine', type: 'fan', page: '3', pageSize: '100',
    })).toEqual({
      hostId: 'host-1', query: 'leaf', view: 'components', role: null,
      componentType: 'fan', page: 3, pageSize: 100,
    })
  })

  it('uses safe defaults and keeps filters relevant to the selected view', () => {
    expect(parseNodePageParams({ role: 'leaf', type: 'psu', page: '-2', pageSize: '13' }))
      .toEqual({ hostId: '', query: '', view: 'nodes', role: 'leaf', componentType: null, page: 1, pageSize: 50 })
    expect(parseNodePageParams({ view: 'components', role: 'leaf', type: 'bogus', pageSize: 'all' }).pageSize)
      .toBe('all')
  })
})

describe('buildNodePageUrl', () => {
  it('builds the canonical purpose URL', () => {
    expect(buildNodePageUrl({
      hostId: 'host 1', query: 'fan tray', view: 'components', role: null,
      componentType: 'psu', page: 2, pageSize: 10,
    })).toBe('/nodes?apic=host+1&view=components&query=fan+tray&type=psu&page=2&pageSize=10')
  })
})
