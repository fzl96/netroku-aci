export type NavigationScope = 'aci' | 'legacy'

// Routes that belong to neither fabric. Physical inventory spans ACI and Legacy
// hardware alike, so it keeps whichever sidebar the reader arrived with.
const SHARED_PREFIXES = [
  '/',
  '/dashboard',
  '/docs',
  '/history',
  '/inventory',
  '/settings',
  '/users',
]

function matchesSegment(pathname: string, prefix: string): boolean {
  if (prefix === '/') return pathname === '/'
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function matchesAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => matchesSegment(pathname, prefix))
}

/** The scope a route pins on its own, or `null` for a shared route that
 *  inherits the reader's last scope. Everything outside /legacy and the shared
 *  routes is an ACI page. */
export function explicitScopeForPath(pathname: string): NavigationScope | null {
  if (matchesSegment(pathname, '/legacy')) return 'legacy'
  if (matchesAny(pathname, SHARED_PREFIXES)) return null
  return 'aci'
}

export function resolveNavigationScope(pathname: string, cookieScope?: string): NavigationScope {
  const explicitScope = explicitScopeForPath(pathname)
  if (explicitScope) return explicitScope
  return cookieScope === 'legacy' ? 'legacy' : 'aci'
}

export function targetPathForScope(pathname: string, target: NavigationScope): string {
  if (resolveNavigationScope(pathname) === target) return pathname
  if (matchesAny(pathname, SHARED_PREFIXES)) return pathname

  if (target === 'legacy') {
    if (matchesSegment(pathname, '/endpoints')) return '/legacy/endpoints'
    if (matchesSegment(pathname, '/interface-health')) return '/legacy/interfaces'
    if (matchesSegment(pathname, '/nodes') || matchesSegment(pathname, '/apic-hosts')) {
      return '/legacy/devices'
    }
    return '/legacy/devices'
  }

  if (matchesSegment(pathname, '/legacy/endpoints')) return '/endpoints'
  if (matchesSegment(pathname, '/legacy/interfaces')) return '/interface-health'
  if (matchesSegment(pathname, '/legacy/devices')) return '/apic-hosts'
  return '/apic-hosts'
}
