'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconArrowRight, IconLoader2 } from '@tabler/icons-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import { useApicHosts } from '@/components/ApicHostsProvider'
import { searchPages } from '@/lib/global-search/pages'
import { documentationResults } from '@/lib/global-search/docs'
import {
  MAX_SEARCH_QUERY,
  MIN_RECORD_QUERY,
  RECORD_GROUPS,
  type SearchGroup,
  type SearchResponse,
} from '@/lib/global-search/types'

type RemoteState = { key: string; groups: SearchGroup[]; loading: boolean }

export function SearchDialog({
  open,
  onOpenChange,
  role,
  onCloseAutoFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  role: string
  onCloseAutoFocus: (event: Event) => void
}) {
  const [query, setQuery] = useState('')
  const [history, setHistory] = useState(false)
  const [retry, setRetry] = useState(0)
  const [records, setRecords] = useState<RemoteState>({ key: '', groups: [], loading: false })
  const [docs, setDocs] = useState<RemoteState>({ key: '', groups: [], loading: false })
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const hosts = useApicHosts()
  const needle = query.trim()
  const recordKey = `${needle}:${history}`
  const docsKey = needle
  const pages = searchPages(needle, role, hosts[0]?.id)

  useEffect(() => {
    if (!open || needle.length < MIN_RECORD_QUERY) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setRecords((previous) => ({
        key: recordKey,
        groups: previous.key === recordKey ? previous.groups : [],
        loading: true,
      }))
      try {
        const params = new URLSearchParams({ query: needle, history: String(history) })
        const response = await fetch(`/api/global-search?${params}`, {
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!response.ok) throw new Error('Search failed')
        const data: SearchResponse = await response.json()
        if (!controller.signal.aborted)
          setRecords({ key: recordKey, groups: data.groups, loading: false })
      } catch {
        if (!controller.signal.aborted)
          setRecords({
            key: recordKey,
            groups: Object.entries(RECORD_GROUPS).map(([id, label]) => ({
              id,
              label,
              items: [],
              error: true,
            })),
            loading: false,
          })
      }
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, needle, history, recordKey, retry])

  useEffect(() => {
    if (!open || !needle) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setDocs((previous) => ({
        key: docsKey,
        groups: previous.key === docsKey ? previous.groups : [],
        loading: true,
      }))
      try {
        const response = await fetch(`/api/search?${new URLSearchParams({ query: needle })}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Documentation search failed')
        const items = documentationResults(await response.json())
        if (!controller.signal.aborted)
          setDocs({
            key: docsKey,
            groups: [{ id: 'docs', label: 'Documentation', items }],
            loading: false,
          })
      } catch {
        if (!controller.signal.aborted)
          setDocs({
            key: docsKey,
            groups: [{ id: 'docs', label: 'Documentation', items: [], error: true }],
            loading: false,
          })
      }
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, needle, docsKey, retry])

  const recordGroups =
    needle.length >= MIN_RECORD_QUERY && records.key === recordKey ? records.groups : []
  const docGroups = needle && docs.key === docsKey ? docs.groups : []
  const groups = [...pages, ...recordGroups, ...docGroups]
  const loading = Boolean(
    needle &&
    (docs.key !== docsKey ||
      docs.loading ||
      (needle.length >= MIN_RECORD_QUERY && (records.key !== recordKey || records.loading))),
  )
  const errors = groups.some((group) => group.error)
  const count = groups.reduce((total, group) => total + group.items.length, 0)

  function navigate(href: string) {
    onOpenChange(false)
    router.push(href)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={onCloseAutoFocus}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}
        className="top-[12dvh] max-h-[80dvh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Search Netroku</DialogTitle>
        <DialogDescription className="sr-only">
          Search pages, records across all sources, and documentation. Use arrow keys to select and
          Enter to navigate.
        </DialogDescription>
        <Command shouldFilter={false} className="p-2">
          <CommandInput
            ref={inputRef}
            className="text-base text-foreground placeholder:text-muted-foreground sm:text-sm"
            value={query}
            onValueChange={setQuery}
            maxLength={MAX_SEARCH_QUERY}
            placeholder="Search pages, IPs, MACs, names…"
            aria-label="Search Netroku"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-3 text-xs text-muted-foreground">
            <span>All sources</span>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={history}
                onChange={(event) => setHistory(event.target.checked)}
                className="accent-primary"
              />
              Include historical endpoints
            </label>
          </div>
          <CommandList className="max-h-[50dvh]" aria-label="Search results">
            {groups.map((group) =>
              group.items.length || group.error ? (
                <CommandGroup key={group.id} heading={group.label}>
                  {group.items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`${group.id}:${item.id}`}
                      onSelect={() => navigate(item.href)}
                      className="cursor-pointer gap-3 py-2"
                    >
                      <IconArrowRight aria-hidden="true" className="text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{item.title}</span>
                        {item.description ? (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                    </CommandItem>
                  ))}
                  {group.error ? (
                    <CommandItem
                      value={`retry-${group.id}`}
                      onSelect={() => setRetry((value) => value + 1)}
                      className="cursor-pointer text-muted-foreground"
                    >
                      Couldn’t search {group.label.toLowerCase()}. Retry
                    </CommandItem>
                  ) : null}
                </CommandGroup>
              ) : null,
            )}
            {loading ? (
              <div
                role="status"
                className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground"
              >
                <IconLoader2 className="size-4 animate-spin" />
                Searching…
              </div>
            ) : null}
            {!loading && count === 0 && !errors ? (
              <p role="status" className="px-3 py-8 text-center text-sm text-muted-foreground">
                No matches found.
              </p>
            ) : null}
            {needle.length > 0 && needle.length < MIN_RECORD_QUERY ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                Type at least {MIN_RECORD_QUERY} characters to search records.
              </p>
            ) : null}
          </CommandList>
          <div className="mt-2 flex gap-4 border-t px-2 pt-3 pb-1 text-[11px] text-muted-foreground">
            <span>↑ ↓ Select</span>
            <span>↵ Go to page</span>
            <span className="ml-auto">Esc Close</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
