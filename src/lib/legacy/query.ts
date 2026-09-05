export const LEGACY_PAGE_SIZES = [10, 50, 100, 1000] as const
export type LegacyPageSize = (typeof LEGACY_PAGE_SIZES)[number]
export const LEGACY_RANGES = ['24h', '7d', '30d', 'all'] as const
export type LegacyRange = (typeof LEGACY_RANGES)[number]

export function parseLegacyPage(value?: string): number {
  const page = Number.parseInt(value ?? '1', 10)
  return Number.isFinite(page) && page > 0 ? page : 1
}

export function parseLegacyPageSize(value?: string): LegacyPageSize {
  const parsed = Number.parseInt(value ?? '50', 10)
  return LEGACY_PAGE_SIZES.includes(parsed as LegacyPageSize) ? (parsed as LegacyPageSize) : 50
}

export function parseLegacyRange(value?: string): LegacyRange {
  return value === '7d' || value === '30d' || value === 'all' ? value : '24h'
}

export function legacyRangeCutoff(range: LegacyRange, now = new Date()): Date | null {
  if (range === 'all') return null
  const hours = range === '24h' ? 24 : range === '7d' ? 24 * 7 : 24 * 30
  return new Date(now.getTime() - hours * 60 * 60 * 1000)
}

const NATURAL_COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

/** A multi-select list param. Repeated keys and comma-joined values both read
 *  the same, and the result is deduped and naturally ordered so the same
 *  selection always produces the same URL and the same cache key. */
export function parseLegacyList(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value]
  const entries = values
    .flatMap((item) => item.split(','))
    .map((item) => item.trim())
    .filter(Boolean)
  return [...new Set(entries)].sort(NATURAL_COLLATOR.compare)
}

/** A detail route's optional page query param: absent or non-numeric means
 *  "use the read's own default," so this returns `undefined` rather than a
 *  clamped fallback like `parseLegacyPage` does for the list pages. */
export function parseLegacyOptionalPage(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}
