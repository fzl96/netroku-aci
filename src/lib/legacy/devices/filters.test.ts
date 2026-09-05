import { describe, expect, it } from 'bun:test'
import { buildLegacyDeviceWhere, LEGACY_DEVICE_ORDER_BY } from './filters'

describe('legacy device queries', () => {
  it('combines identity search with site and type filters', () => {
    expect(
      buildLegacyDeviceWhere({
        query: '9300',
        sites: ['Jakarta'],
        deviceTypes: ['cisco_ios'],
      }),
    ).toEqual({
      AND: [
        { site: { in: ['Jakarta'] } },
        { deviceType: { in: ['cisco_ios'] } },
        {
          OR: [
            { site: { contains: '9300', mode: 'insensitive' } },
            { hostname: { contains: '9300', mode: 'insensitive' } },
            { managementIp: { contains: '9300', mode: 'insensitive' } },
            { deviceType: { contains: '9300', mode: 'insensitive' } },
            { vendor: { contains: '9300', mode: 'insensitive' } },
            { model: { contains: '9300', mode: 'insensitive' } },
            { serialNumber: { contains: '9300', mode: 'insensitive' } },
            { softwareVersion: { contains: '9300', mode: 'insensitive' } },
            { location: { contains: '9300', mode: 'insensitive' } },
          ],
        },
      ],
    })
  })

  it('returns an empty filter when nothing is selected', () => {
    expect(buildLegacyDeviceWhere({})).toEqual({})
  })

  it('orders the roster by hostname with a stable id tie-breaker', () => {
    expect(LEGACY_DEVICE_ORDER_BY).toEqual([{ hostname: 'asc' }, { id: 'asc' }])
  })
})
