export interface InterfaceStatusSample {
  interfaceId: string
  sampledAt: Date
  adminSt: string
  operSt: string
}

export interface StatusHistorySample {
  id: string
  sampledAt: string
  adminSt: string
  operSt: string
  operSpeed: string
  isStateChange: boolean
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
  samples: Array<{
    id: string
    sampledAt: Date
    adminSt: string
    operSt: string
    operSpeed: string
  }>,
): StatusHistorySample[] {
  return samples.map((s, idx) => {
    const prev = idx > 0 ? samples[idx - 1] : null
    const isStateChange = prev
      ? prev.adminSt.toLowerCase() !== s.adminSt.toLowerCase() ||
        prev.operSt.toLowerCase() !== s.operSt.toLowerCase()
      : false

    return {
      id: s.id,
      sampledAt: s.sampledAt.toISOString(),
      adminSt: s.adminSt,
      operSt: s.operSt,
      operSpeed: s.operSpeed,
      isStateChange,
    }
  })
}

/**
 * Identify interface IDs that had a change in adminSt or operSt across consecutive samples.
 */
export function findStateChangedInterfaceIds(samples: InterfaceStatusSample[]): Set<string> {
  const changedIds = new Set<string>()
  const samplesByInterface = new Map<string, InterfaceStatusSample[]>()

  for (const sample of samples) {
    const list = samplesByInterface.get(sample.interfaceId) ?? []
    list.push(sample)
    samplesByInterface.set(sample.interfaceId, list)
  }

  for (const [interfaceId, list] of samplesByInterface.entries()) {
    // Sort ascending by sampledAt
    list.sort((a, b) => a.sampledAt.getTime() - b.sampledAt.getTime())
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]
      const curr = list[i]
      if (
        prev.adminSt.toLowerCase() !== curr.adminSt.toLowerCase() ||
        prev.operSt.toLowerCase() !== curr.operSt.toLowerCase()
      ) {
        changedIds.add(interfaceId)
        break
      }
    }
  }

  return changedIds
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
