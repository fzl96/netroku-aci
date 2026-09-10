import { describe, expect, it } from 'bun:test'
import { filterRacks } from './filter'

const racks = [
  { name: 'A5', devices: [{ id: 'd1', name: 'DC2-SVR-LEAF-3101', serialNumber: 'FDO27420LCS' }] },
  { name: 'B3', devices: [{ id: 'd2', name: 'DC2-CORE-01', serialNumber: 'FDO26400Z0B' }] },
  { name: 'C3', devices: [] },
]

describe('filterRacks', () => {
  it('keeps every rack and marks nothing for a blank query', () => {
    const result = filterRacks(racks, '  ')
    expect(result.racks).toBe(racks)
    expect(result.matchedDeviceIds.size).toBe(0)
  })

  it('matches rack names case-insensitively', () => {
    const result = filterRacks(racks, 'c3')
    expect(result.racks.map((rack) => rack.name)).toEqual(['C3'])
    expect(result.matchedDeviceIds.size).toBe(0)
  })

  it('keeps the rack holding a matching device and marks that device', () => {
    const byName = filterRacks(racks, 'core-01')
    expect(byName.racks.map((rack) => rack.name)).toEqual(['B3'])
    expect([...byName.matchedDeviceIds]).toEqual(['d2'])

    const bySerial = filterRacks(racks, 'fdo27420')
    expect(bySerial.racks.map((rack) => rack.name)).toEqual(['A5'])
    expect([...bySerial.matchedDeviceIds]).toEqual(['d1'])
  })

  it('returns no racks when nothing matches', () => {
    expect(filterRacks(racks, 'zzz').racks).toEqual([])
  })
})
