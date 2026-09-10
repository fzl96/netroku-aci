'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import {
  explicitScopeForPath,
  resolveNavigationScope,
  type NavigationScope,
} from '@/lib/navigation-scope'

type NavigationScopeValue = {
  scope: NavigationScope
  setScope: (scope: NavigationScope) => void
}

const NavigationScopeContext = createContext<NavigationScopeValue | null>(null)

/**
 * Remembers which fabric the reader was last in. Visiting a scoped route
 * (anything under /legacy, or an ACI page) records that scope, so shared routes
 * such as /inventory keep the sidebar the reader arrived with. The cookie
 * carries it across reloads; the sidebar and the mobile top bar read one value.
 */
export function NavigationScopeProvider({
  initialScope,
  children,
}: {
  initialScope: NavigationScope
  children: ReactNode
}) {
  const pathname = usePathname()
  const [lastScope, setLastScope] = useState(initialScope)
  const explicitScope = explicitScopeForPath(pathname)
  if (explicitScope && explicitScope !== lastScope) setLastScope(explicitScope)

  useEffect(() => {
    document.cookie = `netroku_scope=${lastScope}; Path=/; SameSite=Lax; Max-Age=31536000`
  }, [lastScope])

  return (
    <NavigationScopeContext.Provider
      value={{ scope: resolveNavigationScope(pathname, lastScope), setScope: setLastScope }}
    >
      {children}
    </NavigationScopeContext.Provider>
  )
}

/** Must be rendered inside a <NavigationScopeProvider>. */
export function useNavigationScope(): NavigationScopeValue {
  const ctx = useContext(NavigationScopeContext)
  if (ctx === null) {
    throw new Error('useNavigationScope must be used within a <NavigationScopeProvider>')
  }
  return ctx
}
