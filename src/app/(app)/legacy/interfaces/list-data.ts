import type {
  LegacyInterfaceCounterMode,
  LegacyInterfaceSortDirection,
  LegacyInterfaceSortKey,
  LegacyInterfaceView,
} from './list-state'

export interface LegacyCrcDeltaSample {
  interfaceId: string
  dCrcErrors: bigint | null
}

export interface SortableLegacyInterfaceSample {
  collectedAt: string
  inputErrors: string
  outputErrors: string
  crcErrors: string
  dInputErrors: string | null
  dOutputErrors: string | null
  dCrcErrors: string | null
}

export interface SortableLegacyInterfaceRow {
  id: string
  hostname: string
  ifName: string
  description: string
  ipAddress: string | null
  adminSt: string
  operSt: string
  crcWindowTotal: string | null
  sample: SortableLegacyInterfaceSample | null
}

export interface LegacyInterfaceSort {
  key: LegacyInterfaceSortKey
  direction: LegacyInterfaceSortDirection
  mode: LegacyInterfaceCounterMode
  view: LegacyInterfaceView
}

const NATURAL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

export function sumLegacyCrcByInterface(samples: LegacyCrcDeltaSample[]): Map<string, bigint> {
  const totals = new Map<string, bigint>()
  for (const sample of samples) {
    if (sample.dCrcErrors === null || sample.dCrcErrors <= BigInt(0)) continue
    totals.set(
      sample.interfaceId,
      (totals.get(sample.interfaceId) ?? BigInt(0)) + sample.dCrcErrors,
    )
  }
  return totals
}

function parseCounter(value: string | null | undefined): bigint | null {
  if (value === null || value === undefined) return null
  try {
    return BigInt(value)
  } catch {
    return null
  }
}

function compareIdentity(
  a: SortableLegacyInterfaceRow,
  b: SortableLegacyInterfaceRow,
): number {
  const hostnameOrder = NATURAL_COLLATOR.compare(a.hostname, b.hostname)
  if (hostnameOrder !== 0) return hostnameOrder
  const interfaceOrder = NATURAL_COLLATOR.compare(a.ifName, b.ifName)
  if (interfaceOrder !== 0) return interfaceOrder
  return NATURAL_COLLATOR.compare(a.id, b.id)
}

function compareNullable<T>(
  a: T | null,
  b: T | null,
  compare: (left: T, right: T) => number,
  direction: LegacyInterfaceSortDirection,
): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  const order = compare(a, b)
  return direction === 'asc' ? order : -order
}

function selectedCounter(
  row: SortableLegacyInterfaceRow,
  sort: LegacyInterfaceSort,
): bigint | null {
  if (sort.key === 'crcErrors' && sort.view === 'crc') {
    return parseCounter(row.crcWindowTotal)
  }
  const sample = row.sample
  if (!sample) return null
  if (sort.key === 'inputErrors') {
    return parseCounter(sort.mode === 'delta' ? sample.dInputErrors : sample.inputErrors)
  }
  if (sort.key === 'outputErrors') {
    return parseCounter(sort.mode === 'delta' ? sample.dOutputErrors : sample.outputErrors)
  }
  if (sort.key === 'crcErrors') {
    return parseCounter(sort.mode === 'delta' ? sample.dCrcErrors : sample.crcErrors)
  }
  return null
}

function comparePrimary(
  a: SortableLegacyInterfaceRow,
  b: SortableLegacyInterfaceRow,
  sort: LegacyInterfaceSort,
): number {
  if (sort.key === 'inputErrors' || sort.key === 'outputErrors' || sort.key === 'crcErrors') {
    return compareNullable(
      selectedCounter(a, sort),
      selectedCounter(b, sort),
      (left, right) => left === right ? 0 : left < right ? -1 : 1,
      sort.direction,
    )
  }
  if (sort.key === 'collectedAt') {
    const aTime = a.sample ? Date.parse(a.sample.collectedAt) : Number.NaN
    const bTime = b.sample ? Date.parse(b.sample.collectedAt) : Number.NaN
    return compareNullable(
      Number.isFinite(aTime) ? aTime : null,
      Number.isFinite(bTime) ? bTime : null,
      (left, right) => left - right,
      sort.direction,
    )
  }

  const aText = sort.key === 'hostname'
    ? a.hostname
    : sort.key === 'ifName'
      ? a.ifName
      : sort.key === 'description'
        ? a.description
        : sort.key === 'ipAddress'
          ? a.ipAddress
          : sort.key === 'adminSt'
            ? a.adminSt
            : a.operSt
  const bText = sort.key === 'hostname'
    ? b.hostname
    : sort.key === 'ifName'
      ? b.ifName
      : sort.key === 'description'
        ? b.description
        : sort.key === 'ipAddress'
          ? b.ipAddress
          : sort.key === 'adminSt'
            ? b.adminSt
            : b.operSt

  return compareNullable(aText, bText, NATURAL_COLLATOR.compare, sort.direction)
}

export function sortLegacyInterfaceRows<T extends SortableLegacyInterfaceRow>(
  rows: T[],
  sort: LegacyInterfaceSort,
): T[] {
  return [...rows].sort((a, b) => {
    const primary = comparePrimary(a, b, sort)
    return primary !== 0 ? primary : compareIdentity(a, b)
  })
}
