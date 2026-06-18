interface SortableFaultRow {
  severity: string
  code: string
}

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  major: 1,
  minor: 2,
  warning: 3,
}

const NATURAL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

function rank(severity: string): number {
  return SEVERITY_RANK[severity] ?? 99
}

export function sortFaultRows<T extends SortableFaultRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const sevOrder = rank(a.severity) - rank(b.severity)
    if (sevOrder !== 0) return sevOrder
    return NATURAL_COLLATOR.compare(a.code, b.code)
  })
}
