interface SortableInterfaceRow {
  node: string
  ifName: string
}

const NATURAL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

export function sortInterfaceRows<T extends SortableInterfaceRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const nodeOrder = NATURAL_COLLATOR.compare(a.node, b.node)
    if (nodeOrder !== 0) return nodeOrder
    return NATURAL_COLLATOR.compare(a.ifName, b.ifName)
  })
}
