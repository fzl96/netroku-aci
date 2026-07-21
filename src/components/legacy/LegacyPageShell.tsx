import type { ReactNode } from 'react'

export function LegacyPageShell({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="flex min-h-16 flex-col justify-center gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-8 md:py-0">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">{title}</h1>
            <p className="mt-0.5 text-xs text-subtle">{description}</p>
          </div>
          {actions && <div className="flex w-full items-center gap-2 md:w-auto">{actions}</div>}
        </div>
      </div>
      <div className="space-y-4 px-4 py-4 md:px-8 md:py-6">{children}</div>
    </div>
  )
}
