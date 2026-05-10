import type { CsvValidationError } from './types'

export function checkHeaders(
  required: readonly string[],
  actual: string[],
): CsvValidationError | null {
  const missing = required.filter(h => !actual.includes(h))
  if (missing.length === 0) return null
  return { rowIndex: 0, field: 'headers', message: `Missing required columns: ${missing.join(', ')}` }
}

export function deduplicateRows<T extends { rowIndex: number }>(
  rows: T[],
  errors: CsvValidationError[],
  checks: Array<{
    key: (row: T) => string
    message: (row: T, firstIndex: number) => string
  }>,
): T[] {
  for (const check of checks) {
    const seen = new Map<string, number>()
    for (const row of rows) {
      const k = check.key(row)
      const first = seen.get(k)
      if (first !== undefined) {
        errors.push({ rowIndex: row.rowIndex, field: 'duplicate', message: check.message(row, first) })
      } else {
        seen.set(k, row.rowIndex)
      }
    }
  }
  const duplicates = new Set(errors.filter(e => e.field === 'duplicate').map(e => e.rowIndex))
  return rows.filter(r => !duplicates.has(r.rowIndex))
}
