interface SortableHealthRow {
  score: number
  name: string
}

const NATURAL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

export function sortHealthRows<T extends SortableHealthRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    return NATURAL_COLLATOR.compare(a.name, b.name)
  })
}
