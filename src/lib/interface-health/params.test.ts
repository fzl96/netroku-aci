import { describe, expect, it } from 'bun:test'
import {
  buildInterfaceHealthPageUrl,
  interfaceWindowDays,
  parseInterfaceHealthPageParams,
} from './params'

describe('parseInterfaceHealthPageParams', () => {
  it('applies defaults when nothing is supplied', () => {
    expect(parseInterfaceHealthPageParams({})).toEqual({
      hostId: '',
      query: '',
      nodes: [],
      page: 1,
      pageSize: 50,
      view: 'all',
      window: '7d',
      counterMode: 'delta',
      sort: { kind: 'natural' },
    })
  })

  it('takes the first value of a repeated key and trims whitespace', () => {
    const params = parseInterfaceHealthPageParams({
      apic: ['  host-1  ', 'host-2'],
      query: '  eth1  ',
    })
    expect(params.hostId).toBe('host-1')
    expect(params.query).toBe('eth1')
  })

  it('splits the comma-separated node filter and drops blanks', () => {
    expect(parseInterfaceHealthPageParams({ node: 'leaf-1, leaf-2 ,,leaf-3' }).nodes)
      .toEqual(['leaf-1', 'leaf-2', 'leaf-3'])
  })

  it('rejects invalid pages and page sizes', () => {
    expect(parseInterfaceHealthPageParams({ page: '0' }).page).toBe(1)
    expect(parseInterfaceHealthPageParams({ page: '-3' }).page).toBe(1)
    expect(parseInterfaceHealthPageParams({ page: 'abc' }).page).toBe(1)
    expect(parseInterfaceHealthPageParams({ page: '4' }).page).toBe(4)
    expect(parseInterfaceHealthPageParams({ pageSize: '17' }).pageSize).toBe(50)
    expect(parseInterfaceHealthPageParams({ pageSize: '100' }).pageSize).toBe(100)
    expect(parseInterfaceHealthPageParams({ pageSize: 'all' }).pageSize).toBe('all')
  })

  it('normalizes view, window, and counter mode', () => {
    expect(parseInterfaceHealthPageParams({ view: 'crc' }).view).toBe('crc')
    expect(parseInterfaceHealthPageParams({ view: 'state-changed' }).view).toBe('state-changed')
    expect(parseInterfaceHealthPageParams({ view: 'nonsense' }).view).toBe('all')
    expect(parseInterfaceHealthPageParams({ window: '30d' }).window).toBe('30d')
    expect(parseInterfaceHealthPageParams({ window: '90d' }).window).toBe('7d')
    expect(parseInterfaceHealthPageParams({ mode: 'current' }).counterMode).toBe('current')
    expect(parseInterfaceHealthPageParams({ mode: 'nonsense' }).counterMode).toBe('delta')
  })

  it('resolves a counter column sort', () => {
    expect(parseInterfaceHealthPageParams({ sort: 'rxErrors', dir: 'asc' }).sort).toEqual({
      kind: 'counter',
      sort: { key: 'rxErrors', direction: 'asc', mode: 'delta' },
    })
    expect(parseInterfaceHealthPageParams({ sort: 'rxErrors', mode: 'current' }).sort).toEqual({
      kind: 'counter',
      sort: { key: 'rxErrors', direction: 'desc', mode: 'current' },
    })
  })

  it('ranks by windowed CRC total in the CRC view unless a counter column is chosen', () => {
    expect(parseInterfaceHealthPageParams({ view: 'crc' }).sort)
      .toEqual({ kind: 'crc-window', direction: 'desc' })
    expect(parseInterfaceHealthPageParams({ view: 'crc', sort: 'crcWindowTotal', dir: 'asc' }).sort)
      .toEqual({ kind: 'crc-window', direction: 'asc' })
    expect(parseInterfaceHealthPageParams({ view: 'crc', sort: 'rxErrors' }).sort)
      .toEqual({ kind: 'counter', sort: { key: 'rxErrors', direction: 'desc', mode: 'delta' } })
  })

  it('ignores the CRC-only sort key outside the CRC view', () => {
    expect(parseInterfaceHealthPageParams({ sort: 'crcWindowTotal' }).sort)
      .toEqual({ kind: 'natural' })
  })
})

describe('interfaceWindowDays', () => {
  it('maps the window token to a day count', () => {
    expect(interfaceWindowDays('7d')).toBe(7)
    expect(interfaceWindowDays('30d')).toBe(30)
  })
})

describe('buildInterfaceHealthPageUrl', () => {
  it('omits defaults and preserves active filters', () => {
    const base = parseInterfaceHealthPageParams({ apic: 'host-1' })
    expect(buildInterfaceHealthPageUrl(base)).toBe('/interface-health?apic=host-1')

    expect(buildInterfaceHealthPageUrl({
      ...base,
      query: 'eth1',
      nodes: ['leaf-1', 'leaf-2'],
      page: 3,
      pageSize: 'all',
      view: 'crc',
      window: '30d',
      counterMode: 'current',
    })).toBe(
      '/interface-health?apic=host-1&view=crc&window=30d&query=eth1'
      + '&node=leaf-1%2Cleaf-2&mode=current&page=3&pageSize=all',
    )
  })

  it('drops the window outside the views it scopes', () => {
    const params = parseInterfaceHealthPageParams({ apic: 'host-1', window: '30d' })
    expect(params.window).toBe('30d')
    expect(buildInterfaceHealthPageUrl(params)).toBe('/interface-health?apic=host-1')
    expect(buildInterfaceHealthPageUrl({ ...params, view: 'state-changed' }))
      .toBe('/interface-health?apic=host-1&view=state-changed&window=30d')
  })

  it('round-trips through the parser', () => {
    const params = parseInterfaceHealthPageParams({
      apic: 'host-9', view: 'state-changed', query: 'po1', node: 'leaf-4', page: '2', mode: 'current',
    })
    const url = buildInterfaceHealthPageUrl(params)
    const parsed = parseInterfaceHealthPageParams(
      Object.fromEntries(new URL(url, 'http://x').searchParams),
    )
    expect(parsed).toEqual(params)
  })
})
