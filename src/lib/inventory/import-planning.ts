const DEFAULT_RACK_HEIGHT = 42
const MAX_RACK_HEIGHT = 60

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
