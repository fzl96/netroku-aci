// src/components/Section.tsx
'use client'

import { cn } from '@/lib/utils'

interface SectionProps {
  step: number
  title: string
  isActive: boolean
  isDone: boolean
  isInactive: boolean
  summary?: string
  onHeaderClick?: () => void
  children: React.ReactNode
}

export function Section({
  step,
  title,
  isActive,
  isDone,
  isInactive,
  summary,
  onHeaderClick,
  children,
}: SectionProps) {
  const stepBg = isDone ? 'bg-success-dot' : isActive ? 'bg-primary' : 'bg-border'
  const stepText = isDone || isActive ? 'text-primary-foreground' : 'text-subtle'
  const clickable = isDone && !!onHeaderClick

  return (
    <div
      className={cn(
        'mb-2.5 overflow-hidden rounded-xl border border-border bg-card transition-opacity',
        isInactive && 'opacity-50',
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between px-5 py-3.5',
          clickable && 'group cursor-pointer transition-colors hover:bg-muted',
        )}
        onClick={clickable ? onHeaderClick : undefined}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
              stepBg,
              stepText,
            )}
          >
            {isDone ? '✓' : step}
          </span>
          <span className="font-serif text-sm font-medium text-foreground">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {isDone && summary && (
            <span className="flex items-center gap-1.5 text-xs text-subtle">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-success-dot" />
              {summary}
            </span>
          )}
          {clickable && (
            <span className="text-[10px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
              Change
            </span>
          )}
        </div>
      </div>
      {isActive && children}
    </div>
  )
}
