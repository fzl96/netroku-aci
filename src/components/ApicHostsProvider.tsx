'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { SafeApicHost } from '@/actions/apic-hosts'

const ApicHostsContext = createContext<SafeApicHost[] | null>(null)

/**
 * Provides the APIC hosts list to all client components in the subtree.
 * Wrap this around the app layout so every page can access hosts via useApicHosts().
 */
export function ApicHostsProvider({
  hosts,
  children,
}: {
  hosts: SafeApicHost[]
  children: ReactNode
}) {
  return (
    <ApicHostsContext.Provider value={hosts}>
      {children}
    </ApicHostsContext.Provider>
  )
}

/**
 * Access the globally-cached APIC hosts list from any client component.
 * Must be rendered inside an <ApicHostsProvider>.
 */
export function useApicHosts(): SafeApicHost[] {
  const ctx = useContext(ApicHostsContext)
  if (ctx === null) {
    throw new Error('useApicHosts must be used within an <ApicHostsProvider>')
  }
  return ctx
}
