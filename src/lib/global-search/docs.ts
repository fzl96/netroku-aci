import type { SearchResult } from './types'
import { SEARCH_LIMIT } from './types'

/** Treat the public docs response as data, never render its highlight markup as HTML. */
export function documentationResults(value: unknown): SearchResult[] {
  if (!Array.isArray(value)) throw new Error('Invalid documentation search response')
  const items: SearchResult[] = []
  const seen = new Set<string>()
  for (const row of value) {
    if (
      !row ||
      typeof row !== 'object' ||
      typeof row.url !== 'string' ||
      typeof row.content !== 'string'
    )
      continue
    if (
      !row.url.startsWith('/docs') ||
      !/^\/docs(?:[/?#]|$)/.test(row.url) ||
      row.url.includes('\\')
    )
      continue
    // One entry per article, retaining the first (best) matching heading URL.
    const article = row.url.split('#')[0]
    if (seen.has(article)) continue
    seen.add(article)
    const breadcrumbs = Array.isArray(row.breadcrumbs)
      ? row.breadcrumbs.filter((item: unknown) => typeof item === 'string')
      : []
    items.push({
      id: row.url,
      title: row.content.replace(/<[^>]*>/g, '').slice(0, 160),
      description: breadcrumbs.join(' / '),
      href: row.url,
    })
    if (items.length === SEARCH_LIMIT) break
  }
  return items
}
