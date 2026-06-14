import type { Metadata } from 'next'
import { FaultsTile } from './FaultsTile'

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FaultsTile />
        </div>
      </div>
    </div>
  )
}
