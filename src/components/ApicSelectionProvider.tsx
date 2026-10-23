'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useApicHosts } from '@/components/ApicHostsProvider'
import { createApicSelectionStore } from '@/lib/apic-selection'

type ApicSelectionValue = {
  activeId: string | null
  ready: boolean
  resolve: (hostIds: readonly string[]) => string | null
  select: (hostId: string) => void
}

const ApicSelectionContext = createContext<ApicSelectionValue | null>(null)
const APIC_LIST_PATHS = new Set(['/bds', '/epgs', '/endpoints', '/nodes', '/interface-health'])

export function ApicSelectionProvider({
  userId,
  children,
}: {
  userId: string
  children: ReactNode
}) {
  const hosts = useApicHosts()
  const pathname = usePathname()
  const params = useSearchParams()
  const explicitId = APIC_LIST_PATHS.has(pathname) ? params.get('apic')?.trim() || null : null
  const [store] = useState(() => createApicSelectionStore(userId))
  const selection = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  )
  return (
    <ApicSelectionContext.Provider
      value={{
        activeId: store.resolve(
          hosts.map((host) => host.id),
          explicitId,
          selection,
        ),
        ready: selection.ready,
        resolve: (hostIds) => store.resolve(hostIds, explicitId, selection),
        select: store.select,
      }}
    >
      {children}
    </ApicSelectionContext.Provider>
  )
}

export function useApicSelection(): ApicSelectionValue {
  const value = useContext(ApicSelectionContext)
  if (!value) throw new Error('useApicSelection must be used within an ApicSelectionProvider')
  return value
}

/** A detail route's record supplies the APIC when its URL has no list selector. */
export function RecordApicSelection({ hostId }: { hostId: string }) {
  const { select } = useApicSelection()
  useEffect(() => select(hostId), [hostId, select])
  return null
}
