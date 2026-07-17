export type PostureTone = 'healthy' | 'warning' | 'critical' | 'unknown'

export interface PostureInput {
  failedHardware: number
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
    input.failedHardware > 0 ||
    input.offlineNodes > 0
  ) {
    return {
      tone: 'critical',
      label: 'Needs attention',
      detail: 'Critical risk signals are active',
    }
  }

  if (
    input.noisyInterfaces > 0
  ) {
    return {
      tone: 'warning',
      label: 'Degraded',
      detail: 'Review warnings before changes',
    }
  }

  return {
    tone: 'healthy',
    label: 'Stable',
    detail: 'No immediate risk signals detected',
  }
}

export interface AttentionInput {
  failedHardware: number
  offlineNodes: number
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

export interface InterfaceStateRow {
  adminSt: string
  operSt: string
  count: number
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
      key: 'failed-hardware',
      label: 'Failed hardware',
      detail: 'PSU or fan components reporting failed state',
      count: input.failedHardware,
      tone: 'critical',
      href: '/nodes?view=components',
      rank: 10,
    },
    {
      key: 'offline-nodes',
      label: 'Offline nodes',
      detail: 'Fabric nodes not reporting active state',
      count: input.offlineNodes,
      tone: 'critical',
      href: '/nodes',
      rank: 20,
    },
    {
      key: 'interface-errors',
      label: 'Interfaces with errors',
      detail: 'Latest sample includes error or discard deltas',
      count: input.noisyInterfaces,
      tone: 'warning',
      href: '/interface-health',
      rank: 30,
    },
    {
      key: 'down-interfaces',
      label: 'Operationally down interfaces',
      detail: 'Interfaces with oper state down',
      count: input.downInterfaces,
      tone: 'warning',
      href: '/interface-health',
      rank: 40,
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
  return Number(value) > 0
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
  stateRows: InterfaceStateRow[],
  samples: InterfaceSummarySample[],
): InterfaceSummary {
  // Samples are expected to be the latest sample per interface (the dashboard
  // query enforces this via `distinct`), but we dedup defensively so the noisy
  // count never double-counts an interface with stale rows in the input.
  const latestSamples = new Map<string, InterfaceSummarySample>()

  for (const sample of samples) {
    const existing = latestSamples.get(sample.interfaceId)
    if (!existing || sampleTime(sample) > sampleTime(existing)) {
      latestSamples.set(sample.interfaceId, sample)
    }
  }

  let noisy = 0
  for (const sample of latestSamples.values()) {
    if (sampleHasNoise(sample)) noisy += 1
  }

  return stateRows.reduce<InterfaceSummary>(
    (summary, row) => {
      const adminUp = row.adminSt.toLowerCase() === 'up'
      const operUp = row.operSt.toLowerCase() === 'up'

      return {
        ...summary,
        total: summary.total + row.count,
        adminDown: summary.adminDown + (adminUp ? 0 : row.count),
        operDown: summary.operDown + (adminUp && !operUp ? row.count : 0),
      }
    },
    { total: 0, adminDown: 0, operDown: 0, noisy },
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
