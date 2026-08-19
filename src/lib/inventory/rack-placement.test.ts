import { describe, expect, it } from 'bun:test'
import { canPlaceDevice, type PlaceableDevice } from './rack-placement'

describe('canPlaceDevice', () => {
  it('allows placement in an empty rack within bounds', () => {
    expect(canPlaceDevice([], 'dev-1', 1, 2, 42)).toBe(true)
  })

  it('rejects placement below unit 1', () => {
    const devices: PlaceableDevice[] = []
    expect(canPlaceDevice(devices, 'dev-1', 0, 1, 42)).toBe(false)
  })

  it('rejects placement extending past the top of the rack', () => {
    const devices: PlaceableDevice[] = []
    expect(canPlaceDevice(devices, 'dev-1', 42, 2, 42)).toBe(false)
  })

  it('allows a device to exactly fill the rack', () => {
    expect(canPlaceDevice([], 'dev-1', 1, 42, 42)).toBe(true)
  })

  it('rejects overlap with another device', () => {
    const devices: PlaceableDevice[] = [
      { id: 'dev-2', rackPosition: 10, heightU: 2 }, // occupies U10-U11
    ]
    expect(canPlaceDevice(devices, 'dev-1', 11, 1, 42)).toBe(false)
    expect(canPlaceDevice(devices, 'dev-1', 9, 2, 42)).toBe(false) // occupies U9-U10, overlaps at U10
  })

  it('allows adjacent (non-overlapping) placement', () => {
    const devices: PlaceableDevice[] = [
      { id: 'dev-2', rackPosition: 10, heightU: 2 }, // occupies U10-U11
    ]
    expect(canPlaceDevice(devices, 'dev-1', 12, 1, 42)).toBe(true)
    expect(canPlaceDevice(devices, 'dev-1', 8, 2, 42)).toBe(true) // occupies U8-U9
  })

  it('excludes the device being moved from its own collision check', () => {
    const devices: PlaceableDevice[] = [
      { id: 'dev-1', rackPosition: 10, heightU: 2 },
    ]
    expect(canPlaceDevice(devices, 'dev-1', 10, 2, 42)).toBe(true)
  })

  it('ignores unassigned devices (null rackPosition) in the same list', () => {
    const devices: PlaceableDevice[] = [
      { id: 'dev-2', rackPosition: null, heightU: 4 },
    ]
    expect(canPlaceDevice(devices, 'dev-1', 1, 4, 42)).toBe(true)
  })

  it('treats zero/negative heightU on an existing device as at least 1U for overlap purposes', () => {
    const devices: PlaceableDevice[] = [
      { id: 'dev-2', rackPosition: 5, heightU: 0 },
    ]
    expect(canPlaceDevice(devices, 'dev-1', 5, 1, 42)).toBe(false)
    expect(canPlaceDevice(devices, 'dev-1', 6, 1, 42)).toBe(true)
  })
})
