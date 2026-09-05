import { describe, expect, test } from 'bun:test'
import { buildLegacyInterfaceDetailUrl, parseLegacyInterfaceDetailParams } from './detail-params'

describe('parseLegacyInterfaceDetailParams', () => {
  test('defaults to the shortest range and the first page', () => {
    expect(parseLegacyInterfaceDetailParams({})).toEqual({
      range: '24h',
      page: 1,
      backUrl: '',
    })
  })

  test('accepts the supported ranges and rejects anything else', () => {
    expect(parseLegacyInterfaceDetailParams({ range: '30d' }).range).toBe('30d')
    expect(parseLegacyInterfaceDetailParams({ range: 'all' }).range).toBe('all')
    expect(parseLegacyInterfaceDetailParams({ range: 'forever' }).range).toBe('24h')
  })

  test('clamps a non-positive page', () => {
    expect(parseLegacyInterfaceDetailParams({ page: '0' }).page).toBe(1)
    expect(parseLegacyInterfaceDetailParams({ page: '3' }).page).toBe(3)
  })

  test('honours a back link only when it names the interfaces list', () => {
    expect(parseLegacyInterfaceDetailParams({ from: '/legacy/interfaces' }).backUrl).toBe(
      '/legacy/interfaces',
    )
    expect(parseLegacyInterfaceDetailParams({ from: '/legacy/interfaces?view=crc' }).backUrl).toBe(
      '/legacy/interfaces?view=crc',
    )
    expect(parseLegacyInterfaceDetailParams({ from: 'https://evil.test' }).backUrl).toBe('')
    expect(parseLegacyInterfaceDetailParams({ from: '/legacy/devices' }).backUrl).toBe('')
  })
})

describe('buildLegacyInterfaceDetailUrl', () => {
  test('omits defaults and escapes the id', () => {
    expect(buildLegacyInterfaceDetailUrl('i1')).toBe('/legacy/interfaces/i1')
    expect(buildLegacyInterfaceDetailUrl('a/b')).toBe('/legacy/interfaces/a%2Fb')
    expect(buildLegacyInterfaceDetailUrl('i1', { range: '24h', page: 1 })).toBe(
      '/legacy/interfaces/i1',
    )
  })

  test('carries the range, page, and back link', () => {
    expect(
      buildLegacyInterfaceDetailUrl('i1', {
        range: '7d',
        page: 2,
        backUrl: '/legacy/interfaces?view=crc',
      }),
    ).toBe('/legacy/interfaces/i1?range=7d&page=2&from=%2Flegacy%2Finterfaces%3Fview%3Dcrc')
  })

  test('round-trips through the parser', () => {
    const params = { range: '30d' as const, page: 4, backUrl: '/legacy/interfaces?query=uplink' }
    const url = new URL(buildLegacyInterfaceDetailUrl('i1', params), 'http://x')
    expect(parseLegacyInterfaceDetailParams(Object.fromEntries(url.searchParams))).toEqual(params)
  })
})
