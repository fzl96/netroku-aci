const NATURAL_COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

export function sortNodeRows<T extends { nodeId: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => NATURAL_COLLATOR.compare(a.nodeId, b.nodeId))
}

export function sortComponentRows<T extends { healthy: boolean; nodeId: string; name: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (a.healthy !== b.healthy) return a.healthy ? 1 : -1
    const nodeOrder = NATURAL_COLLATOR.compare(a.nodeId, b.nodeId)
    return nodeOrder || NATURAL_COLLATOR.compare(a.name, b.name)
  })
}
