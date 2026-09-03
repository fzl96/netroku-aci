import type { ReactNode } from 'react'

export function LegacyEmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card px-6 py-20 text-center shadow-sm">
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-border bg-muted text-faint">
        {icon}
      </div>
      <h2 className="font-serif text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-subtle">{description}</p>
    </div>
  )
}
