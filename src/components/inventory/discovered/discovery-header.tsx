import type { ReactNode } from 'react'
import Link from 'next/link'

// Shared by the page's loading fallback and the loaded client view so the
// header never shifts when discoveries arrive.
export function DiscoveryHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0">
      <div className="flex flex-col justify-between gap-3 px-4 py-3 md:h-16 md:flex-row md:items-center md:px-8 md:py-0">
        <div className="min-w-0">
          <h1 className="font-serif text-[18px] font-semibold text-foreground">
            <Link
              href="/inventory/devices"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Devices
            </Link>
            <span aria-hidden className="mx-1.5 font-normal text-faint">
              /
            </span>
            Discovered
          </h1>
          <p className="mt-0.5 truncate text-xs text-subtle">
            Link hardware found by ACI and Legacy scans to physical inventory
          </p>
        </div>
        {actions}
      </div>
    </header>
  )
}
