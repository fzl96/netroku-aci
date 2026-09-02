export const LEGACY_PAGE_SIZES = [10, 50, 100, 1000] as const
export type LegacyPageSize = (typeof LEGACY_PAGE_SIZES)[number]
export type LegacyRange = '24h' | '7d' | '30d' | 'all'

export function parseLegacyPage(value?: string): number {
  const page = Number.parseInt(value ?? '1', 10)
  return Number.isFinite(page) && page > 0 ? page : 1
}

export function parseLegacyPageSize(value?: string): LegacyPageSize {
  const parsed = Number.parseInt(value ?? '50', 10)
  return LEGACY_PAGE_SIZES.includes(parsed as LegacyPageSize)
    ? parsed as LegacyPageSize
    : 50
}

export function parseLegacyRange(value?: string): LegacyRange {
  return value === '7d' || value === '30d' || value === 'all' ? value : '24h'
}

export function legacyRangeCutoff(
  range: LegacyRange,
  now = new Date(),
): Date | null {
  if (range === 'all') return null
  const hours = range === '24h' ? 24 : range === '7d' ? 24 * 7 : 24 * 30
  return new Date(now.getTime() - hours * 60 * 60 * 1000)
}

export function parseLegacySort<const T extends readonly string[]>(
  value: string | undefined,
  allowed: T,
  fallback: T[number],
): T[number] {
  return allowed.includes(value ?? '') ? value as T[number] : fallback
}

export function parseLegacyDirection(value?: string): 'asc' | 'desc' {
  return value === 'asc' ? 'asc' : 'desc'
}
