import { Skeleton } from '@/components/ui/skeleton'

function SkeletonPill({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 ${className}`}>
      <Skeleton className="h-3 w-3 rounded-full" />
      <Skeleton className="h-3 w-20" />
    </span>
  )
}

function SkeletonMetric() {
  return (
    <div className="min-h-32 p-5">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-4 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-9 w-20" />
      <Skeleton className="mt-2 h-3 w-28" />
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-4 w-4 rounded-full" />
      </div>
      <div className="mt-5">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="mt-2 h-3 w-24" />
      </div>
      <Skeleton className="mt-4 h-4 w-36" />
      <Skeleton className="mt-2 h-3 w-32" />
    </div>
  )
}

function SkeletonAttentionRow() {
  return (
    <div className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
      <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-2 h-3 w-full max-w-64" />
      </div>
      <Skeleton className="h-4 w-4 rounded-full" />
    </div>
  )
}

function SkeletonTableRow() {
  return (
    <tr>
      <td className="py-3 pr-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2 h-3 w-44" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-20" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-16" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-12" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-4 w-20" />
      </td>
      <td className="py-3 pl-4">
        <Skeleton className="h-3 w-24" />
      </td>
    </tr>
  )
}

export default function DashboardLoading() {
  return (
    <div className="min-h-full bg-background" aria-busy="true" role="status">
      <span className="sr-only">Loading dashboard</span>

      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="flex min-h-16 flex-col gap-3 px-5 py-3 md:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Dashboard</h1>
            <Skeleton className="mt-2 h-3 w-44" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SkeletonPill />
            <SkeletonPill className="w-40" />
          </div>
        </div>
      </div>

      <div className="px-5 py-6 md:px-8">
        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="grid lg:grid-cols-[1.1fr_1.9fr]">
            <div className="p-5 md:p-6">
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-28 rounded-lg" />
                <Skeleton className="h-3 w-28" />
              </div>
              <div className="mt-6">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="mt-3 h-9 w-full max-w-md" />
                <Skeleton className="mt-3 h-9 w-3/4 max-w-sm" />
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-4 w-full max-w-lg" />
                  <Skeleton className="h-4 w-11/12 max-w-md" />
                  <Skeleton className="h-4 w-2/3 max-w-sm" />
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div>
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-2 h-8 w-14" />
                </div>
                <div>
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-2 h-8 w-14" />
                </div>
              </div>
            </div>

            <div className="grid border-t border-border sm:grid-cols-2 lg:grid-cols-3 lg:border-l lg:border-t-0">
              {Array.from({ length: 6 }, (_, index) => (
                <div
                  key={index}
                  className={[
                    index % 3 !== 0 ? 'lg:border-l lg:border-border' : '',
                    index > 2 ? 'border-t border-border' : index > 0 ? 'border-t border-border sm:border-t-0' : '',
                    index % 2 !== 0 ? 'sm:border-l sm:border-border lg:border-l' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <SkeletonMetric />
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="mt-2 h-3 w-36" />
              </div>
              <Skeleton className="h-5 w-5 rounded-full" />
            </div>
            <div className="mt-4 divide-y divide-border">
              {Array.from({ length: 4 }, (_, index) => (
                <SkeletonAttentionRow key={index} />
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Skeleton className="h-5 w-36" />
                <Skeleton className="mt-2 h-3 w-56" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 5 }, (_, index) => (
                  <Skeleton key={index} className="h-7 w-24 rounded-lg" />
                ))}
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Host', 'Endpoints', 'Faults', 'Health', 'Nodes', 'Freshest data'].map((heading, index) => (
                      <th
                        key={heading}
                        className={[
                          'py-2 font-medium',
                          index === 0 ? 'pr-4' : index === 5 ? 'pl-4' : 'px-4',
                        ].join(' ')}
                      >
                        <Skeleton className="h-3 w-20" />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Array.from({ length: 4 }, (_, index) => (
                    <SkeletonTableRow key={index} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-9 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}
