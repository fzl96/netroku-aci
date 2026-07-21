import { describe, expect, it } from 'bun:test'
import {
  buildLegacyHealthDeviceWhere,
  legacyHealthOrderBy,
  legacyStatusText,
  serializeLegacyHealthSample,
} from './health'

describe('legacy health helpers', () => {
  it('combines devices with health samples, search, and site filters', () => {
    expect(buildLegacyHealthDeviceWhere({ query: 'edge', sites: ['HO'] })).toEqual({
      AND: [
        { healthSamples: { some: {} } },
        { site: { in: ['HO'] } },
        { OR: [
          { hostname: { contains: 'edge', mode: 'insensitive' } },
          { site: { contains: 'edge', mode: 'insensitive' } },
          { managementIp: { contains: 'edge', mode: 'insensitive' } },
        ] },
      ],
    })
  })

  it('preserves missing measurements and explicit hardware statuses', () => {
    expect(legacyStatusText([])).toBe('Not reported')
    expect(legacyStatusText(['OK', 'NOT PRESENT'])).toBe('OK, NOT PRESENT')
    expect(serializeLegacyHealthSample({
      id: 'sample-1', collectedAt: new Date('2026-07-21T12:00:00Z'), uptime: '1 day',
      cpuPercent: null, memoryPercent: 44.5, storagePercent: 20,
      temperatureCelsius: null, fanStatuses: [], psuStatuses: ['OK'],
    })).toEqual({
      id: 'sample-1', collectedAt: '2026-07-21T12:00:00.000Z', uptime: '1 day',
      cpuPercent: null, memoryPercent: 44.5, storagePercent: 20,
      temperatureCelsius: null, fanStatuses: [], psuStatuses: ['OK'],
    })
  })

  it('maps supported device-level health sorts', () => {
    expect(legacyHealthOrderBy('hostname', 'asc')).toEqual([{ hostname: 'asc' }, { id: 'asc' }])
    expect(legacyHealthOrderBy('unknown', 'asc')).toEqual([{ lastHealthSyncAt: 'desc' }, { id: 'asc' }])
  })
})
