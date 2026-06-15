export type PostureTone = 'healthy' | 'warning' | 'critical' | 'unknown'

export interface PostureInput {
  criticalFaults: number
  majorFaults: number
  failedHardware: number
  worstHealthScore: number | null
  offlineNodes: number
  noisyInterfaces: number
}

export interface PostureResult {
  tone: PostureTone
  label: string
  detail: string
}

export function classifyPosture(input: PostureInput): PostureResult {
  if (
    input.criticalFaults > 0 ||
    input.failedHardware > 0 ||
    input.offlineNodes > 0 ||
    (input.worstHealthScore !== null && input.worstHealthScore < 70)
  ) {
    return {
      tone: 'critical',
      label: 'Needs attention',
      detail: 'Critical risk signals are active',
    }
  }

  if (
    input.majorFaults > 0 ||
    input.noisyInterfaces > 0 ||
    (input.worstHealthScore !== null && input.worstHealthScore < 90)
  ) {
    return {
      tone: 'warning',
      label: 'Degraded',
      detail: 'Review warnings before changes',
    }
  }

  if (input.worstHealthScore === null) {
    return {
      tone: 'unknown',
      label: 'No health data',
      detail: 'Sync health scores to complete posture',
    }
  }

  return {
    tone: 'healthy',
    label: 'Stable',
    detail: 'No immediate risk signals detected',
  }
}

export interface AttentionInput {
  criticalFaults: number
  majorFaults: number
  failedHardware: number
  offlineNodes: number
  degradedHealthObjects: number
  noisyInterfaces: number
  downInterfaces: number
}

export interface AttentionItem {
  key: string
  label: string
  detail: string
  count: number
  tone: Exclude<PostureTone, 'unknown'>
  href: string
  rank: number
}

export interface InterfaceSummarySnapshot {
  id: string
  adminSt: string
  operSt: string
}

export interface InterfaceSummarySample {
  interfaceId: string
  sampledAt: string | Date
  dRxErrors: bigint | number | null
  dTxErrors: bigint | number | null
  dRxDiscards: bigint | number | null
  dTxDiscards: bigint | number | null
  dRxCrcErrors: bigint | number | null
  dRxAlignErrors: bigint | number | null
}

export interface InterfaceSummary {
  total: number
  adminDown: number
  operDown: number
  noisy: number
}

export function buildAttentionItems(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [
    {
      key: 'critical-faults',
      label: 'Critical faults',
      detail: 'Active critical fabric faults',
      count: input.criticalFaults,
      tone: 'critical',
      href: '/faults?severity=critical',
      rank: 10,
    },
    {
      key: 'failed-hardware',
      label: 'Failed hardware',
      detail: 'PSU or fan components reporting failed state',
      count: input.failedHardware,
      tone: 'critical',
      href: '/nodes?view=components',
      rank: 20,
    },
    {
      key: 'offline-nodes',
      label: 'Offline nodes',
      detail: 'Fabric nodes not reporting active state',
      count: input.offlineNodes,
      tone: 'critical',
      href: '/nodes',
      rank: 30,
    },
    {
      key: 'major-faults',
      label: 'Major faults',
      detail: 'Active major fabric faults',
      count: input.majorFaults,
      tone: 'warning',
      href: '/faults?severity=major',
      rank: 40,
    },
    {
      key: 'degraded-health',
      label: 'Degraded health objects',
      detail: 'Node or tenant health below 90',
      count: input.degradedHealthObjects,
      tone: 'warning',
      href: '/health-scores',
      rank: 50,
    },
    {
      key: 'interface-errors',
      label: 'Interfaces with errors',
      detail: 'Latest sample includes error or discard deltas',
      count: input.noisyInterfaces,
      tone: 'warning',
      href: '/interface-health',
      rank: 60,
    },
    {
      key: 'down-interfaces',
      label: 'Operationally down interfaces',
      detail: 'Interfaces with oper state down',
      count: input.downInterfaces,
      tone: 'warning',
      href: '/interface-health',
      rank: 70,
    },
  ]

  return items
    .filter(item => item.count > 0)
    .sort((a, b) => a.rank - b.rank)
}

function sampleTime(sample: InterfaceSummarySample): number {
  const date = sample.sampledAt instanceof Date ? sample.sampledAt : new Date(sample.sampledAt)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function hasPositiveDelta(value: bigint | number | null | undefined): boolean {
  if (value === null || value === undefined) return false
  return BigInt(value) > BigInt(0)
}

function sampleHasNoise(sample: InterfaceSummarySample | undefined): boolean {
  if (!sample) return false

  return [
    sample.dRxErrors,
    sample.dTxErrors,
    sample.dRxDiscards,
    sample.dTxDiscards,
    sample.dRxCrcErrors,
    sample.dRxAlignErrors,
  ].some(hasPositiveDelta)
}

export function summarizeInterfaces(
  snapshots: InterfaceSummarySnapshot[],
  samples: InterfaceSummarySample[],
): InterfaceSummary {
  const latestSamples = new Map<string, InterfaceSummarySample>()

  for (const sample of samples) {
    const existing = latestSamples.get(sample.interfaceId)
    if (!existing || sampleTime(sample) > sampleTime(existing)) {
      latestSamples.set(sample.interfaceId, sample)
    }
  }

  return snapshots.reduce<InterfaceSummary>(
    (summary, snapshot) => {
      const adminUp = snapshot.adminSt.toLowerCase() === 'up'
      const operUp = snapshot.operSt.toLowerCase() === 'up'

      return {
        total: summary.total + 1,
        adminDown: summary.adminDown + (adminUp ? 0 : 1),
        operDown: summary.operDown + (adminUp && !operUp ? 1 : 0),
        noisy: summary.noisy + (sampleHasNoise(latestSamples.get(snapshot.id)) ? 1 : 0),
      }
    },
    { total: 0, adminDown: 0, operDown: 0, noisy: 0 },
  )
}

export function formatRelativeFreshness(value: string | Date | null, now = new Date()): string {
  if (!value) return 'Never synced'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'Never synced'

  const diffMs = Math.max(0, now.getTime() - date.getTime())
  const diffMinutes = Math.floor(diffMs / 60_000)
  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 48) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}
