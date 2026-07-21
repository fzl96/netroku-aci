import { describe, expect, test } from 'bun:test'
import { buildLegacyEndpointWhere, legacyEndpointOrderBy } from './endpoints'

describe('legacy endpoint helpers', () => {
  test('builds active, historical, and all lifecycle views', () => {
    expect(buildLegacyEndpointWhere({ statuses: ['active'] })).toEqual({ AND: [{ isActive: true }] })
    expect(buildLegacyEndpointWhere({ statuses: ['historical'] })).toEqual({ AND: [{ isActive: false }] })
    expect(buildLegacyEndpointWhere({ statuses: ['active', 'historical'] })).toEqual({})
  })

  test('combines placement and device filters with searchable endpoint identity', () => {
    expect(buildLegacyEndpointWhere({
      query: 'edge',
      deviceIds: ['device-1'],
      sites: ['HO'],
      vlans: ['120'],
      interfaces: ['Gi1/0/1'],
      statuses: ['active'],
    })).toEqual({ AND: [
      { deviceId: { in: ['device-1'] } },
      { device: { site: { in: ['HO'] } } },
      { vlan: { in: ['120'] } },
      { interface: { in: ['Gi1/0/1'] } },
      { isActive: true },
      { OR: [
        { mac: { contains: 'edge', mode: 'insensitive' } },
        { ip: { contains: 'edge', mode: 'insensitive' } },
        { vlan: { contains: 'edge', mode: 'insensitive' } },
        { vlanName: { contains: 'edge', mode: 'insensitive' } },
        { interface: { contains: 'edge', mode: 'insensitive' } },
        { learningType: { contains: 'edge', mode: 'insensitive' } },
        { device: { hostname: { contains: 'edge', mode: 'insensitive' } } },
        { device: { managementIp: { contains: 'edge', mode: 'insensitive' } } },
      ] },
    ] })
  })

  test('maps supported sorts and uses a stable id tie-breaker', () => {
    expect(legacyEndpointOrderBy('mac', 'asc')).toEqual([{ mac: 'asc' }, { id: 'asc' }])
    expect(legacyEndpointOrderBy('unknown', 'asc')).toEqual([{ lastSeenAt: 'desc' }, { id: 'asc' }])
  })
})
