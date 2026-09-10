'use client'

import type { ReactNode } from 'react'
import { IconFilter2 } from '@tabler/icons-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** The square filter button list toolbars sit beside their search field. Its
 *  badge counts the filter groups in use; the menu holds `FilterSubmenu`s. */
export function FilterMenu({
  label,
  activeCount,
  disabled = false,
  menuWidth = 'w-48',
  children,
}: {
  label: string
  activeCount: number
  disabled?: boolean
  menuWidth?: string
  children: ReactNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={label}
          aria-label={label}
          disabled={disabled}
          className={[
            'relative flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors outline-none',
            'focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-40',
            activeCount > 0
              ? 'border-primary bg-primary/8 text-foreground'
              : 'border-border bg-muted text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          <IconFilter2 size={15} stroke={1.75} />
          {activeCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground shadow-sm">
              {activeCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className={menuWidth} align="start">
        <DropdownMenuLabel>Filters</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
