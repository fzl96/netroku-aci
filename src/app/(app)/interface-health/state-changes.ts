export interface StatusHistorySample {
  id: string
  sampledAt: string
  adminSt: string
  operSt: string
  operSpeed: string
  isStateChange: boolean
}

export interface RawStatusHistorySample {
  id: string
  sampledAt: Date
  adminSt: string
  operSt: string
  operSpeed: string
}

export interface InterfaceStatusDetails {
  id: string
  node: string
  ifName: string
  dn: string
  usage: string
  adminSt: string
  operSt: string
  operSpeed: string
  description: string
  lastLinkStChg: string | null
  firstSeenAt: string
  lastSeenAt: string
  samples: StatusHistorySample[]
}

export function serializeStatusSamples(
  samples: RawStatusHistorySample[],
  baseline: RawStatusHistorySample | null = null,
): StatusHistorySample[] {
  const comparisonSamples = baseline ? [baseline, ...samples] : samples
  const serialized = comparisonSamples.map((sample, index) => {
    const previous = index > 0 ? comparisonSamples[index - 1] : null
    const isStateChange = previous
      ? previous.adminSt.toLowerCase() !== sample.adminSt.toLowerCase() ||
        previous.operSt.toLowerCase() !== sample.operSt.toLowerCase()
      : false

    return {
      id: sample.id,
      sampledAt: sample.sampledAt.toISOString(),
      adminSt: sample.adminSt,
      operSt: sample.operSt,
      operSpeed: sample.operSpeed,
      isStateChange,
    }
  })

  return baseline ? serialized.slice(1) : serialized
}

/**
 * Check if the last link state change occurred within the given window.
 */
export function isRecentLinkStateChange(
  lastLinkStChg: Date | string | null,
  windowStart: Date,
): boolean {
  if (!lastLinkStChg) return false
  const d = typeof lastLinkStChg === 'string' ? new Date(lastLinkStChg) : lastLinkStChg
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() >= windowStart.getTime()
}

/**
 * Check if an interface is operationally down (admin up but oper down, or oper down).
 */
export function isOperDown(adminSt: string, operSt: string): boolean {
  const adminUp = adminSt.toLowerCase() === 'up'
  const operUp = operSt.toLowerCase() === 'up'
  return !operUp && (adminUp || operSt.length > 0)
}
