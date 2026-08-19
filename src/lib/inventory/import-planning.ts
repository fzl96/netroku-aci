const DEFAULT_RACK_HEIGHT = 42
const MAX_RACK_HEIGHT = 60

type RackPlanningRow = {
  row: {
    site: string | null
    rack: string | null
    rackPosition: number | null
    heightU: number
  }
  rackStatus?: 'EXISTS' | 'WILL_CREATE'
  errors: string[]
}

export type PlannedRack = {
  key: string
  siteName: string
  rackName: string
  heightU: number
}

export function requiredRackHeight(
  rackPosition: number | null,
  deviceHeight: number,
): number {
  if (rackPosition === null) return DEFAULT_RACK_HEIGHT

  const topU = rackPosition + deviceHeight - 1
  if (topU > MAX_RACK_HEIGHT) {
    throw new Error(`Position U${topU} exceeds maximum rack height (${MAX_RACK_HEIGHT}U)`)
  }
  return Math.max(DEFAULT_RACK_HEIGHT, topU)
}

export function buildNewRackPlan(rows: RackPlanningRow[]): PlannedRack[] {
  const racks = new Map<string, PlannedRack>()

  for (const state of rows) {
    if (
      state.errors.length > 0 ||
      state.rackStatus !== 'WILL_CREATE' ||
      !state.row.rack
    ) {
      continue
    }

    const siteName = state.row.site ?? 'Default'
    const key = `${siteName.toLowerCase()}::${state.row.rack.toLowerCase()}`
    const existing = racks.get(key)
    racks.set(key, {
      key,
      siteName,
      rackName: state.row.rack,
      heightU: Math.max(
        existing?.heightU ?? DEFAULT_RACK_HEIGHT,
        requiredRackHeight(state.row.rackPosition, state.row.heightU),
      ),
    })
  }

  return Array.from(racks.values())
}
