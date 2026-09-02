import Link from 'next/link'
import { Suspense } from 'react'
import { IconDeviceDesktopSearch, IconPlugConnected, IconServer2 } from '@tabler/icons-react'
import {
  getDashboardEndpoints,
  getDashboardHosts,
  getDashboardInterfaces,
  getDashboardNodes,
} from '@/lib/dashboard/query'
import { DashboardAttention } from './dashboard-attention'
import { DashboardInventory } from './dashboard-inventory'
import { DashboardMetrics } from './dashboard-metrics'
import { DashboardPosture } from './dashboard-posture'
import {
  DashboardAttentionSkeleton,
  DashboardHeaderSkeleton,
  DashboardInventorySkeleton,
  DashboardMetricsSkeleton,
  DashboardPostureSkeleton,
} from './dashboard-skeleton'
import { DashboardStatus } from './dashboard-status'

export function DashboardView() {
  const hostsPromise = getDashboardHosts()
  const endpointsPromise = getDashboardEndpoints()
  const interfacesPromise = getDashboardInterfaces()
  const nodesPromise = getDashboardNodes()

  return (
    <main className="min-h-full bg-background">
      <header className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0">
        <div className="flex min-h-16 flex-col gap-3 px-5 py-3 md:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Dashboard</h1>
            <p className="mt-0.5 text-xs text-subtle">Global ACI operations overview</p>
          </div>
          <Suspense fallback={<DashboardHeaderSkeleton />}>
            <DashboardStatus hostsPromise={hostsPromise} endpointsPromise={endpointsPromise} />
          </Suspense>
        </div>
      </header>

      <div className="px-5 py-6 md:px-8">
        <Suspense fallback={<DashboardPostureSkeleton />}>
          <DashboardPosture
            endpointsPromise={endpointsPromise}
            interfacesPromise={interfacesPromise}
            nodesPromise={nodesPromise}
          />
        </Suspense>

        <div className="mt-4">
          <Suspense fallback={<DashboardMetricsSkeleton />}>
            <DashboardMetrics
              endpointsPromise={endpointsPromise}
              interfacesPromise={interfacesPromise}
              nodesPromise={nodesPromise}
            />
          </Suspense>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Suspense fallback={<DashboardAttentionSkeleton />}>
            <DashboardAttention interfacesPromise={interfacesPromise} nodesPromise={nodesPromise} />
          </Suspense>
          <Suspense fallback={<DashboardInventorySkeleton />}>
            <DashboardInventory
              hostsPromise={hostsPromise}
              endpointsPromise={endpointsPromise}
              nodesPromise={nodesPromise}
            />
          </Suspense>
        </div>

        <nav aria-label="Dashboard detail pages" className="mt-4 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
          <Link href="/endpoints" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-foreground/20 hover:text-foreground">
            <IconDeviceDesktopSearch size={14} stroke={1.75} /> Endpoint inventory
          </Link>
          <Link href="/interface-health" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-foreground/20 hover:text-foreground">
            <IconPlugConnected size={14} stroke={1.75} /> Interface counters
          </Link>
          <Link href="/nodes" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-foreground/20 hover:text-foreground">
            <IconServer2 size={14} stroke={1.75} /> Nodes and hardware
          </Link>
        </nav>
      </div>
    </main>
  )
}
