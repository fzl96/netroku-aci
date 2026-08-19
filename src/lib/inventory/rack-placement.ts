export type PlaceableDevice = {
  id: string
  rackPosition: number | null
  heightU: number
}

export function canPlaceDevice(
  devices: PlaceableDevice[],
  deviceId: string,
  rackPosition: number,
  heightU: number,
  rackHeightU: number,
): boolean {
  const start = rackPosition
  const end = rackPosition + heightU - 1

  if (start < 1 || end > rackHeightU) return false

  return !devices.some((device) => {
    if (device.id === deviceId || device.rackPosition === null) return false
    const otherStart = device.rackPosition
    const otherEnd = device.rackPosition + Math.max(1, device.heightU) - 1
    return start <= otherEnd && end >= otherStart
  })
}
