import { describe, expect, it } from 'bun:test'
import {
  buildDeviceListUrl,
  buildDeviceWhere,
  clampDevicePage,
  deviceListWindow,
  parseDeviceListParams,
} from './device-query'

describe('parseDeviceListParams', () => {
  it('trims the query and accepts a positive page', () => {
    expect(parseDeviceListParams({ q: '  sw01  ', page: '3' })).toEqual({
      query: 'sw01',
      page: 3,
    })
  })

  it('falls back to page 1 for missing or invalid page', () => {
    expect(parseDeviceListParams({})).toEqual({ query: '', page: 1 })
    expect(parseDeviceListParams({ page: '-2' })).toEqual({ query: '', page: 1 })
  })
})

describe('buildDeviceWhere', () => {
  it('returns an empty where clause for no query', () => {
    expect(buildDeviceWhere({ query: '', page: 1 })).toEqual({})
  })

  it('builds an OR clause across searchable fields for a query', () => {
    const where = buildDeviceWhere({ query: 'core', page: 1 })
    expect(where.OR).toBeDefined()
    expect(where.OR).toHaveLength(9)
    expect(where.OR).toContainEqual({
      managementIp: { contains: 'core', mode: 'insensitive' },
    })
    expect(where.OR).toContainEqual({
      deviceStack: { name: { contains: 'core', mode: 'insensitive' } },
    })
  })
})

describe('clampDevicePage / deviceListWindow', () => {
  it('clamps to the last page when requesting beyond the end', () => {
    expect(clampDevicePage(99, 25)).toBe(2) // 25 items / 20 per page = 2 pages
  })

  it('clamps to page 1 when there are no results', () => {
    expect(clampDevicePage(5, 0)).toBe(1)
  })

  it('computes skip/take for a mid-range page', () => {
    expect(deviceListWindow(2, 45)).toEqual({ page: 2, skip: 20, take: 20 })
  })
})

describe('buildDeviceListUrl', () => {
  it('omits defaults and preserves an active query while paging', () => {
    expect(buildDeviceListUrl({ query: '', page: 1 })).toBe('/inventory/devices')
    expect(buildDeviceListUrl({ query: '  sw01  ', page: 3 })).toBe(
      '/inventory/devices?q=sw01&page=3',
    )
  })
})
