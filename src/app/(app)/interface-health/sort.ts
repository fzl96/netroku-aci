interface SortableInterfaceRow {
  node: string
  ifName: string
}

export type InterfaceSortKey =
  | 'rxErrors'
  | 'txErrors'
  | 'rxCrcErrors'
  | 'rxAlignErrors'
  | 'rxBytes'
  | 'txBytes'

export type InterfaceSortDirection = 'asc' | 'desc'
export type InterfaceSortMode = 'delta' | 'current'

export interface InterfaceSort {
  key: InterfaceSortKey
  direction: InterfaceSortDirection
  mode: InterfaceSortMode
}

export const INTERFACE_SORT_KEYS: InterfaceSortKey[] = [
  'rxErrors',
  'txErrors',
  'rxCrcErrors',
  'rxAlignErrors',
  'rxBytes',
  'txBytes',
]

type InterfaceSampleCounters = Partial<Record<
  | InterfaceSortKey
  | 'dRxErrors'
  | 'dTxErrors'
  | 'dRxCrcErrors'
  | 'dRxAlignErrors'
  | 'dRxBytes'
  | 'dTxBytes',
  bigint | null
>>

interface SortableInterfaceCounterRow extends SortableInterfaceRow {
  samples?: InterfaceSampleCounters[]
}

const NATURAL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

const DELTA_FIELD_BY_KEY: Record<InterfaceSortKey, keyof InterfaceSampleCounters> = {
  rxErrors: 'dRxErrors',
  txErrors: 'dTxErrors',
  rxCrcErrors: 'dRxCrcErrors',
  rxAlignErrors: 'dRxAlignErrors',
  rxBytes: 'dRxBytes',
  txBytes: 'dTxBytes',
}

export function parseInterfaceSortParams(params: {
  sort?: string
  dir?: string
  mode?: string
}): InterfaceSort | null {
  if (!INTERFACE_SORT_KEYS.includes(params.sort as InterfaceSortKey)) return null

  return {
    key: params.sort as InterfaceSortKey,
    direction: params.dir === 'asc' ? 'asc' : 'desc',
    mode: params.mode === 'current' ? 'current' : 'delta',
  }
}

function naturalInterfaceOrder(a: SortableInterfaceRow, b: SortableInterfaceRow): number {
  const nodeOrder = NATURAL_COLLATOR.compare(a.node, b.node)
  if (nodeOrder !== 0) return nodeOrder
  return NATURAL_COLLATOR.compare(a.ifName, b.ifName)
}

function counterValue(row: SortableInterfaceCounterRow, sort: InterfaceSort): bigint | null {
  const sample = row.samples?.[0]
  if (!sample) return null
  const field = sort.mode === 'delta' ? DELTA_FIELD_BY_KEY[sort.key] : sort.key
  return sample[field] ?? null
}

export function sortInterfaceRows<T extends SortableInterfaceCounterRow>(
  rows: T[],
  sort?: InterfaceSort,
): T[] {
  return [...rows].sort((a, b) => {
    if (!sort) return naturalInterfaceOrder(a, b)

    const aValue = counterValue(a, sort)
    const bValue = counterValue(b, sort)

    if (aValue === null && bValue !== null) return 1
    if (aValue !== null && bValue === null) return -1
    if (aValue !== null && bValue !== null && aValue !== bValue) {
      const order = aValue > bValue ? 1 : -1
      return sort.direction === 'asc' ? order : -order
    }

    return naturalInterfaceOrder(a, b)
  })
}
