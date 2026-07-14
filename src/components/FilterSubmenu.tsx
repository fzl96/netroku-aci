'use client'

import { useState } from 'react'
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'

export function FilterSubmenu({
  label,
  value,
  options,
  onChange,
  disabled,
  searchable = false,
}: {
  label: string
  value: string[]
  options: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
  searchable?: boolean
}) {
  const [searchValue, setSearchValue] = useState('')

  function toggle(opt: string) {
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])
  }

  const visibleOptions = searchable && searchValue.trim()
    ? options.filter(option => option.toLowerCase().includes(searchValue.trim().toLowerCase()))
    : options

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={disabled}>
        <span>{label}</span>
        {value.length > 0 && (
          <span className="ml-auto mr-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
            {value.length}
          </span>
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-48">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {searchable && (
          <div className="px-1 pb-1">
            <Input
              value={searchValue}
              onChange={event => setSearchValue(event.target.value)}
              onKeyDown={event => event.stopPropagation()}
              placeholder={`Search ${label.toLowerCase()}…`}
              disabled={disabled || options.length === 0}
              className="h-7 text-xs"
            />
          </div>
        )}
        <div className={searchable ? 'max-h-56 overflow-y-auto pr-1' : undefined}>
          {options.length === 0 ? (
            <DropdownMenuItem disabled>No values available</DropdownMenuItem>
          ) : visibleOptions.length === 0 ? (
            <DropdownMenuItem disabled>No matching values</DropdownMenuItem>
          ) : (
            visibleOptions.map(opt => (
              <DropdownMenuCheckboxItem
                key={opt}
                checked={value.includes(opt)}
                disabled={disabled}
                onCheckedChange={() => toggle(opt)}
                onSelect={event => event.preventDefault()}
              >
                {opt}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </div>
        {value.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={disabled}
              onSelect={() => onChange([])}
            >
              Clear {label}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
