type FilterableRack = {
  name: string
  devices: Array<{ id: string; name: string; serialNumber: string }>
}

/** Racks whose name matches the query, plus racks holding a device whose name
 *  or serial matches. The matched device ids let the elevation mark why a rack
 *  was kept. A blank query keeps every rack. */
export function filterRacks<T extends FilterableRack>(
  racks: T[],
  query: string,
): { racks: T[]; matchedDeviceIds: Set<string> } {
  const needle = query.trim().toLowerCase()
  const matchedDeviceIds = new Set<string>()
  if (!needle) return { racks, matchedDeviceIds }

  const matched = racks.filter((rack) => {
    let keep = rack.name.toLowerCase().includes(needle)
    for (const device of rack.devices) {
      if (
        device.name.toLowerCase().includes(needle) ||
        device.serialNumber.toLowerCase().includes(needle)
      ) {
        matchedDeviceIds.add(device.id)
        keep = true
      }
    }
    return keep
  })
  return { racks: matched, matchedDeviceIds }
}
