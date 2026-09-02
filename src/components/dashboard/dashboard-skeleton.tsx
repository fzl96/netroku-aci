import { Skeleton } from '@/components/ui/skeleton'
import { DASHBOARD_TABLE_HEAD_CLS, TABLE_SCROLL_CLS } from '@/lib/ui-classes'

function BusyRegion({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section aria-busy="true" aria-label={label} className={className}>
      {children}
    </section>
  )
}

function SkeletonMetric() {
  return (
    <div className="min-h-32 p-5">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="size-4 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-9 w-20" />
      <Skeleton className="mt-2 h-3 w-28" />
    </div>
  )
}

export function DashboardHeaderSkeleton() {
  return (
    <BusyRegion label="Loading dashboard status" className="flex flex-wrap items-center gap-2">
      <Skeleton className="h-7 w-24 rounded-lg" />
      <Skeleton className="h-7 w-40 rounded-lg" />
    </BusyRegion>
  )
}

export function DashboardPostureSkeleton() {
  return (
    <BusyRegion label="Loading global posture" className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="grid lg:grid-cols-[1.1fr_1.9fr]">
        <div className="p-5 md:p-6">
          <Skeleton className="h-7 w-48 rounded-lg" />
          <Skeleton className="mt-6 h-3 w-28" />
          <Skeleton className="mt-3 h-9 w-full max-w-md" />
          <Skeleton className="mt-4 h-4 w-full max-w-lg" />
        </div>
        <div className="grid border-t border-border sm:grid-cols-2 lg:border-l lg:border-t-0">
          {Array.from({ length: 4 }, (_, index) => (
            <div className={index > 1 ? 'border-t border-border' : ''} key={index}>
              <SkeletonMetric />
            </div>
          ))}
        </div>
      </div>
    </BusyRegion>
  )
}

export function DashboardMetricsSkeleton() {
  return (
    <BusyRegion label="Loading dashboard metrics" className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div className="rounded-lg border border-border bg-card p-5 shadow-sm" key={index}>
          <div className="flex items-center justify-between"><Skeleton className="h-8 w-32" /><Skeleton className="size-4" /></div>
          <Skeleton className="mt-5 h-9 w-20" />
          <Skeleton className="mt-2 h-3 w-28" />
          <Skeleton className="mt-4 h-4 w-36" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
      ))}
    </BusyRegion>
  )
}

export function DashboardAttentionSkeleton() {
  return (
    <BusyRegion label="Loading attention items" className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="mt-2 h-3 w-36" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="flex items-center gap-4" key={index}>
            <Skeleton className="size-10 rounded-lg" />
            <div className="flex-1"><Skeleton className="h-4 w-36" /><Skeleton className="mt-2 h-3 w-full max-w-64" /></div>
          </div>
        ))}
      </div>
    </BusyRegion>
  )
}

export function DashboardInventorySkeleton() {
  return (
    <BusyRegion label="Loading APIC host coverage" className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <Skeleton className="h-5 w-36" />
      <Skeleton className="mt-2 h-3 w-56" />
      <div className={`mt-4 ${TABLE_SCROLL_CLS}`}>
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead><tr>{['Host', 'Endpoints', 'Nodes', 'Freshest data'].map(heading => <th className={`${DASHBOARD_TABLE_HEAD_CLS} py-2 pr-4`} key={heading}><Skeleton className="h-3 w-20" /></th>)}</tr></thead>
          <tbody>{Array.from({ length: 4 }, (_, index) => <tr key={index}><td className="py-3 pr-4"><Skeleton className="h-4 w-32" /></td><td><Skeleton className="h-4 w-20" /></td><td><Skeleton className="h-4 w-20" /></td><td><Skeleton className="h-3 w-24" /></td></tr>)}</tbody>
        </table>
      </div>
    </BusyRegion>
  )
}
