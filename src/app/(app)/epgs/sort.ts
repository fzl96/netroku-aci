const NATURAL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

/** Natural sort bindings by node then port (eth1/2 before eth1/10). */
export function sortBindingRows<T extends { node: string; port: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      NATURAL_COLLATOR.compare(a.node, b.node) || NATURAL_COLLATOR.compare(a.port, b.port),
  )
}
