// src/components/Section.tsx
'use client'

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

export function Section({ step, title, isActive, isDone, isInactive, summary, onHeaderClick, children }: SectionProps) {
  const stepBg   = isDone ? 'bg-[#16a34a]' : isActive ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
  const stepText = isDone || isActive ? 'text-white' : 'text-[var(--text-subtle)]'
  const clickable = isDone && !!onHeaderClick

  return (
    <div
      className={`bg-[var(--surface)] border border-[var(--border)] rounded-xl mb-2.5 overflow-hidden transition-opacity ${isInactive ? 'opacity-50' : ''}`}
    >
      <div
        className={`px-5 py-3.5 flex items-center justify-between ${clickable ? 'cursor-pointer hover:bg-[var(--surface-alt)] transition-colors group' : ''}`}
        onClick={clickable ? onHeaderClick : undefined}
      >
        <div className="flex items-center gap-2.5">
          <span className={`${stepBg} ${stepText} w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0`}>
            {isDone ? '✓' : step}
          </span>
          <span className="font-serif text-sm font-medium text-[var(--text)]">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {isDone && summary && (
            <span className="text-xs text-[var(--text-subtle)] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-[#16a34a] rounded-full inline-block" />
              {summary}
            </span>
          )}
          {clickable && (
            <span className="text-[10px] text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity font-medium">
              Change
            </span>
          )}
        </div>
      </div>
      {isActive && children}
    </div>
  )
}
