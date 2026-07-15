export interface RawCrcInterfaceSample {
  interfaceId: string
  dRxCrcErrors: bigint | null
}

/**
 * Sum strictly-positive CRC deltas per interface across the provided window
 * samples. Null / non-positive deltas (e.g. counter resets) contribute 0, so
 * an interface only appears in the map if it gained at least one CRC error.
 */
export function sumCrcByInterface(
  samples: RawCrcInterfaceSample[],
): Map<string, bigint> {
  const totals = new Map<string, bigint>()
  for (const s of samples) {
    if (s.dRxCrcErrors === null || s.dRxCrcErrors <= BigInt(0)) continue
    const current = totals.get(s.interfaceId) ?? BigInt(0)
    totals.set(s.interfaceId, current + s.dRxCrcErrors)
  }
  return totals
}

interface CrcSortableRow {
  id: string
  node: string
  ifName: string
}

const CRC_NATURAL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

/**
 * Sort rows by their windowed CRC total (looked up in `totals`, missing = 0),
 * defaulting to descending so the worst offender is first. Ties fall back to
 * natural node/ifName ordering. Returns a new array.
 */
export function sortByCrcWindowTotal<T extends CrcSortableRow>(
  rows: T[],
  totals: Map<string, bigint>,
  direction: 'asc' | 'desc' = 'desc',
): T[] {
  return [...rows].sort((a, b) => {
    const aTotal = totals.get(a.id) ?? BigInt(0)
    const bTotal = totals.get(b.id) ?? BigInt(0)
    if (aTotal !== bTotal) {
      const order = aTotal > bTotal ? 1 : -1
      return direction === 'asc' ? order : -order
    }
    const nodeOrder = CRC_NATURAL_COLLATOR.compare(a.node, b.node)
    if (nodeOrder !== 0) return nodeOrder
    return CRC_NATURAL_COLLATOR.compare(a.ifName, b.ifName)
  })
}
