import { ACI_NAV, LEGACY_INFRASTRUCTURE, type NavChild } from '@/lib/navigation'
import type { SearchGroup, SearchResult } from './types'
import { normalizeSearchQuery, SEARCH_LIMIT, searchHref } from './types'

export function searchPages(query: string, role: string, apicId?: string): SearchGroup[] {
  const needle = normalizeSearchQuery(query)
  const groups: SearchGroup[] = []
  for (const section of [...ACI_NAV, LEGACY_INFRASTRUCTURE]) {
    const legacy = section === LEGACY_INFRASTRUCTURE
    const label = legacy ? 'Legacy pages' : section.group ? `${section.group} pages` : 'Pages'
    const items: SearchResult[] = []
    function visit(node: NavChild, parents: string[], apicParam = false) {
      const title = [...parents, node.label].join(' · ')
      // Sidebar parents with children are expanders, not navigable destinations.
      if (node.children?.length) {
        for (const child of node.children) visit(child, [...parents, node.label], apicParam)
      } else if (node.href && `${label} ${title}`.toLowerCase().includes(needle)) {
        items.push({
          id: node.href,
          title,
          description: legacy ? 'Legacy' : section.group === 'Infrastructure' ? 'ACI' : '',
          href: apicParam && apicId ? searchHref(node.href, { apic: apicId }) : node.href,
        })
      }
    }
    for (const item of section.items) {
      if (item.action || (item.adminOnly && role !== 'admin')) continue
      visit(item, [], item.apicParam)
    }
    if (needle)
      items.sort(
        (a, b) =>
          Number(b.title.toLowerCase() === needle) - Number(a.title.toLowerCase() === needle),
      )
    if (items.length)
      groups.push({
        id: `pages-${label}`,
        label,
        items: needle ? items.slice(0, SEARCH_LIMIT) : items,
      })
  }
  return groups
}
