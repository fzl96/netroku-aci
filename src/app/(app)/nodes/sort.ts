const NATURAL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

interface SortableNodeRow {
  nodeId: string
}

export function sortNodeRows<T extends SortableNodeRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => NATURAL_COLLATOR.compare(a.nodeId, b.nodeId))
}

interface SortableComponentRow {
  healthy: boolean
  nodeId: string
  name: string
}

export function sortComponentRows<T extends SortableComponentRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.healthy !== b.healthy) return a.healthy ? 1 : -1
    const nodeOrder = NATURAL_COLLATOR.compare(a.nodeId, b.nodeId)
    if (nodeOrder !== 0) return nodeOrder
    return NATURAL_COLLATOR.compare(a.name, b.name)
  })
}
