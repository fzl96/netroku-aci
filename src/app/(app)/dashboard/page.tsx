import type { Metadata } from 'next'
import { IconHammer, IconLayoutDashboard } from '@tabler/icons-react'

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Netroku ACI dashboard.',
}

export default function DashboardPage() {
  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="px-8 h-16 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Dashboard</h1>
            <p className="text-xs text-subtle mt-0.5">Operational overview</p>
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        <section className="min-h-[420px] rounded-2xl border border-border bg-card shadow-sm flex items-center justify-center">
          <div className="max-w-sm text-center px-6">
            <div className="mx-auto mb-5 h-14 w-14 rounded-2xl bg-muted border border-border flex items-center justify-center shadow-sm relative">
              <IconLayoutDashboard size={24} stroke={1.5} className="text-muted-foreground" />
              <span className="absolute -right-1 -top-1 h-6 w-6 rounded-full bg-background border border-border flex items-center justify-center">
                <IconHammer size={12} stroke={1.75} className="text-faint" />
              </span>
            </div>
            <h2 className="font-serif text-lg font-semibold text-foreground">Under construction</h2>
            <p className="text-xs text-subtle leading-relaxed mt-2">
              Dashboard metrics and operational summaries will be added here.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
