'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { IconSearch } from '@tabler/icons-react'
import { useSidebar } from '@/components/ui/sidebar'

const SearchDialog = dynamic(() => import('./search-dialog').then((module) => module.SearchDialog))
const SearchContext = createContext<(() => void) | null>(null)

export function GlobalSearchProvider({
  role,
  children,
}: {
  role: 'admin' | 'member'
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const returnFocus = useRef<HTMLElement | null>(null)
  const { setOpenMobile } = useSidebar()

  function openSearch() {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setOpenMobile(false)
    setMounted(true)
    setOpen(true)
  }

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== 'k' ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.isComposing
      )
        return
      event.preventDefault()
      if (event.repeat) return
      if (open) setOpen(false)
      else {
        returnFocus.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null
        setOpenMobile(false)
        setMounted(true)
        setOpen(true)
      }
    }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  }, [open, setOpenMobile])

  return (
    <SearchContext.Provider value={openSearch}>
      {children}
      {mounted ? (
        <SearchDialog
          open={open}
          onOpenChange={setOpen}
          role={role}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (returnFocus.current?.isConnected) returnFocus.current.focus()
          }}
        />
      ) : null}
    </SearchContext.Provider>
  )
}

export function GlobalSearchTrigger({ mobile = false }: { mobile?: boolean }) {
  const open = useContext(SearchContext)
  if (!open) throw new Error('Global search must be inside GlobalSearchProvider')
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Search pages, records and documentation"
      aria-haspopup="dialog"
      aria-keyshortcuts="Control+k Meta+k"
      className={
        mobile
          ? 'rounded-md p-2 text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring'
          : 'flex h-9 w-full items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/50 px-2.5 text-xs text-sidebar-foreground/70 outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring'
      }
    >
      <IconSearch size={16} aria-hidden="true" />
      {!mobile ? (
        <>
          <span className="flex-1 text-left">Search anything…</span>
          <kbd className="rounded border border-sidebar-border px-1 py-0.5 text-[10px]">
            ⌘ / Ctrl K
          </kbd>
        </>
      ) : null}
    </button>
  )
}
