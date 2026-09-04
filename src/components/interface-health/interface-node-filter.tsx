'use client'

import { use, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { IconFilter2 } from '@tabler/icons-react'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  buildInterfaceHealthPageUrl,
  type InterfaceHealthPageParams,
} from '@/lib/interface-health/params'
import type { InterfaceLoadState, InterfaceOverviewPayload } from '@/lib/interface-health/query'
import { InterfaceRegionError } from './interface-region-error'

function interfaceUrl(
  params: InterfaceHealthPageParams,
  overrides: Partial<InterfaceHealthPageParams>,
): string {
  return buildInterfaceHealthPageUrl({ ...params, ...overrides })
}

export function InterfaceNodeFilter({
  dataPromise,
}: {
  dataPromise: Promise<InterfaceLoadState<InterfaceOverviewPayload>>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const state = use(dataPromise)
  if (state.kind === 'unauthorized') return <InterfaceRegionError region="filters" compact />
  if (state.kind === 'inactive') return null

  const { params, overview } = state.data
  const availableNodes = overview.availableNodes
  const activeFilterCount = params.nodes.length > 0 ? 1 : 0

  function toggle(value: string) {
    const next = params.nodes.includes(value)
      ? params.nodes.filter((v) => v !== value)
      : [...params.nodes, value]
    startTransition(() => router.replace(interfaceUrl(params, { nodes: next, page: 1 })))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Filter interfaces"
          aria-label="Filter interfaces"
          disabled={isPending}
          className={[
            'relative flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors outline-none',
            'focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-40',
            activeFilterCount > 0
              ? 'border-primary bg-primary/8 text-foreground'
              : 'border-border bg-muted text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          <IconFilter2 size={15} stroke={1.75} />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground shadow-sm">
              {activeFilterCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-44" align="start">
        <DropdownMenuLabel>Node</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableNodes.length === 0 ? (
          <DropdownMenuItem disabled>No values available</DropdownMenuItem>
        ) : (
          availableNodes.map((n) => (
            <DropdownMenuCheckboxItem
              key={n || '(blank)'}
              checked={params.nodes.includes(n)}
              onCheckedChange={() => toggle(n)}
              onSelect={(event) => event.preventDefault()}
            >
              {n || '(blank)'}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
