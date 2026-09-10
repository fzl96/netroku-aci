import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** A titled panel on the device detail page. `flush` drops the body padding
 *  so a table can run edge to edge. */
export function DetailSection({
  title,
  action,
  flush = false,
  children,
}: {
  title: string
  action?: ReactNode
  flush?: boolean
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex min-h-11 items-center justify-between gap-3 border-b border-border-faint px-5 py-2.5">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action}
      </header>
      <div className={cn(!flush && 'p-5')}>{children}</div>
    </section>
  )
}
