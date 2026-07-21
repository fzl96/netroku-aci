export type NavigationScope = 'aci' | 'legacy'

const ACI_PREFIXES = [
  '/apic-hosts',
  '/endpoints',
  '/epgs',
  '/interface-health',
  '/nodes',
  '/bridge-domains',
  '/policy/bridge-domains',
  '/static-ports',
  '/interface-selectors',
]

const SHARED_PREFIXES = [
  '/',
  '/dashboard',
  '/docs',
  '/history',
  '/settings',
  '/users',
]

function matchesSegment(pathname: string, prefix: string): boolean {
  if (prefix === '/') return pathname === '/'
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function matchesAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(prefix => matchesSegment(pathname, prefix))
}

export function resolveNavigationScope(
  pathname: string,
  cookieScope?: string,
): NavigationScope {
  if (matchesSegment(pathname, '/legacy')) return 'legacy'
  if (matchesAny(pathname, ACI_PREFIXES)) return 'aci'
  if (matchesAny(pathname, SHARED_PREFIXES) && cookieScope === 'legacy') return 'legacy'
  return 'aci'
}

export function targetPathForScope(
  pathname: string,
  target: NavigationScope,
): string {
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
