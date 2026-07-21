import { describe, expect, test } from 'bun:test'
import {
  buildLegacyInterfaceWhere,
  legacyInterfaceOrderBy,
  safeLegacyCounterNumber,
  serializeLegacyInterfaceSample,
} from './interfaces'

describe('legacy interface helpers', () => {
  test('combines inventory search, device, site, state, and presence filters', () => {
    expect(buildLegacyInterfaceWhere({
      query: 'uplink',
      deviceIds: ['device-1'],
      sites: ['HO'],
      adminStates: ['up'],
      operStates: ['down'],
      presence: 'absent',
    })).toEqual({
      AND: [
        { deviceId: { in: ['device-1'] } },
        { device: { site: { in: ['HO'] } } },
        { adminSt: { in: ['up'] } },
        { operSt: { in: ['down'] } },
        { present: false },
        { OR: [
          { ifName: { contains: 'uplink', mode: 'insensitive' } },
          { description: { contains: 'uplink', mode: 'insensitive' } },
          { ipAddress: { contains: 'uplink', mode: 'insensitive' } },
          { device: { hostname: { contains: 'uplink', mode: 'insensitive' } } },
          { device: { managementIp: { contains: 'uplink', mode: 'insensitive' } } },
        ] },
      ],
    })
  })

  test('keeps interface counters exact when serializing database rows', () => {
    expect(serializeLegacyInterfaceSample({
      id: 'sample-1',
      collectedAt: new Date('2026-07-21T01:02:03.000Z'),
      adminSt: 'up',
      operSt: 'down',
      speed: '10G',
      inputErrors: 9_007_199_254_740_993n,
      outputErrors: 2n,
      crcErrors: 3n,
      dInputErrors: null,
      dOutputErrors: 1n,
      dCrcErrors: 2n,
    })).toEqual({
      id: 'sample-1',
      collectedAt: '2026-07-21T01:02:03.000Z',
      adminSt: 'up',
      operSt: 'down',
      speed: '10G',
      inputErrors: '9007199254740993',
      outputErrors: '2',
      crcErrors: '3',
      dInputErrors: null,
      dOutputErrors: '1',
      dCrcErrors: '2',
    })
  })

  test('only converts counters that fit safely in a chart number', () => {
    expect(safeLegacyCounterNumber('42')).toBe(42)
    expect(safeLegacyCounterNumber('9007199254740993')).toBeNull()
    expect(safeLegacyCounterNumber(null)).toBeNull()
  })

  test('maps supported interface sorts with a stable tie-breaker', () => {
    expect(legacyInterfaceOrderBy('ifName', 'asc')).toEqual([{ ifName: 'asc' }, { id: 'asc' }])
    expect(legacyInterfaceOrderBy('unknown', 'asc')).toEqual([{ lastSeenAt: 'desc' }, { id: 'asc' }])
  })
})
