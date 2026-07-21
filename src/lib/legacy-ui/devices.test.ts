import { describe, expect, it } from 'bun:test'
import { buildLegacyDeviceWhere, legacyDeviceOrderBy } from './devices'

describe('legacy device queries', () => {
  it('combines identity search with site and type filters', () => {
    expect(buildLegacyDeviceWhere({
      query: '9300',
      sites: ['Jakarta'],
      deviceTypes: ['cisco_ios'],
    })).toEqual({
      AND: [
        { site: { in: ['Jakarta'] } },
        { deviceType: { in: ['cisco_ios'] } },
        { OR: [
          { site: { contains: '9300', mode: 'insensitive' } },
          { hostname: { contains: '9300', mode: 'insensitive' } },
          { managementIp: { contains: '9300', mode: 'insensitive' } },
          { deviceType: { contains: '9300', mode: 'insensitive' } },
          { vendor: { contains: '9300', mode: 'insensitive' } },
          { model: { contains: '9300', mode: 'insensitive' } },
          { serialNumber: { contains: '9300', mode: 'insensitive' } },
          { softwareVersion: { contains: '9300', mode: 'insensitive' } },
          { location: { contains: '9300', mode: 'insensitive' } },
        ] },
      ],
    })
  })

  it('returns an empty filter and safe sort mappings', () => {
    expect(buildLegacyDeviceWhere({})).toEqual({})
    expect(legacyDeviceOrderBy('hostname', 'asc')).toEqual({ hostname: 'asc' })
    expect(legacyDeviceOrderBy('unknown', 'asc')).toEqual({ lastSeenAt: 'desc' })
  })
})
