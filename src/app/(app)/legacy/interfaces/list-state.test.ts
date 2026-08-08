import { describe, expect, test } from 'bun:test'
import {
  buildLegacyInterfaceUrl,
  mergeLegacyInterfaceListState,
  nextLegacyInterfaceSort,
  parseLegacyInterfaceListState,
} from './list-state'

describe('legacy interface list state', () => {
  test('defaults to all, delta, seven days, and hostname ascending', () => {
    expect(parseLegacyInterfaceListState({})).toEqual({
      query: '',
      deviceIds: [],
      view: 'all',
      mode: 'delta',
      window: '7d',
      sortKey: 'hostname',
      sortDirection: 'asc',
      page: 1,
      pageSize: 50,
    })
  })

  test('parses supported controls and ignores removed filters', () => {
    expect(parseLegacyInterfaceListState({
      query: ' edge ',
      device: 'd2, d1,d2,,',
      view: 'crc',
      mode: 'current',
      window: '30d',
      sort: 'crcErrors',
      site: 'DC',
      admin: 'down',
      oper: 'notconnect',
      presence: 'absent',
      page: '2',
      pageSize: '100',
    })).toEqual({
      query: 'edge',
      deviceIds: ['d2', 'd1'],
      view: 'crc',
      mode: 'current',
      window: '30d',
      sortKey: 'crcErrors',
      sortDirection: 'desc',
      page: 2,
      pageSize: 100,
    })
  })

  test('falls back safely for invalid list controls', () => {
    expect(parseLegacyInterfaceListState({
      view: 'broken',
      mode: 'raw',
      window: 'all',
      sort: 'mtu',
      dir: 'sideways',
      page: '-1',
      pageSize: '999',
    })).toEqual({
      query: '',
      deviceIds: [],
      view: 'all',
      mode: 'delta',
      window: '7d',
      sortKey: 'hostname',
      sortDirection: 'asc',
      page: 1,
      pageSize: 50,
    })
  })

  test('keeps bookmarked speed sorting as a hidden server-side option', () => {
    expect(parseLegacyInterfaceListState({ sort: 'speed' })).toMatchObject({
      sortKey: 'speed',
      sortDirection: 'desc',
    })
    expect(parseLegacyInterfaceListState({ sort: 'speed', dir: 'asc' })).toMatchObject({
      sortKey: 'speed',
      sortDirection: 'asc',
    })
  })

  test('builds a canonical URL and omits key-specific default directions', () => {
    expect(buildLegacyInterfaceUrl({
      query: ' edge ',
      deviceIds: ['d2', 'd1'],
      view: 'crc',
      mode: 'current',
      window: '30d',
      sortKey: 'crcErrors',
      sortDirection: 'desc',
      page: 2,
      pageSize: 100,
    })).toBe('/legacy/interfaces?query=edge&device=d2%2Cd1&view=crc&mode=current&window=30d&sort=crcErrors&page=2&pageSize=100')

    expect(buildLegacyInterfaceUrl(parseLegacyInterfaceListState({}))).toBe('/legacy/interfaces')
    expect(buildLegacyInterfaceUrl({
      ...parseLegacyInterfaceListState({}),
      sortDirection: 'desc',
    })).toBe('/legacy/interfaces?sort=hostname&dir=desc')
  })

  test('starts text ascending and counters descending, then toggles active keys', () => {
    expect(nextLegacyInterfaceSort('hostname', 'asc', 'ifName')).toEqual({ key: 'ifName', direction: 'asc' })
    expect(nextLegacyInterfaceSort('ifName', 'asc', 'ifName')).toEqual({ key: 'ifName', direction: 'desc' })
    expect(nextLegacyInterfaceSort('hostname', 'asc', 'inputErrors')).toEqual({ key: 'inputErrors', direction: 'desc' })
    expect(nextLegacyInterfaceSort('inputErrors', 'desc', 'inputErrors')).toEqual({ key: 'inputErrors', direction: 'asc' })
  })

  test('merges sequential immediate controls without losing prior pending changes', () => {
    const initial = parseLegacyInterfaceListState({
      device: 'd1',
      view: 'crc',
      page: '3',
    })
    const withSecondDevice = mergeLegacyInterfaceListState(initial, {
      deviceIds: [...initial.deviceIds, 'd2'],
    })
    const withSearch = mergeLegacyInterfaceListState(withSecondDevice, { query: 'edge' })

    expect(withSearch).toMatchObject({
      query: 'edge',
      deviceIds: ['d1', 'd2'],
      view: 'crc',
      page: 1,
    })
  })
})
