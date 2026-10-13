import { Suspense } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getInventoryViewerRole } from '@/lib/inventory/authorize'
import { InventoryReadError } from '@/lib/inventory/errors'
import { getCompliancePolicies } from '@/lib/inventory/compliance/query'
import { CompliancePolicyForm } from './policy-form'
import { RefreshReport } from './refresh-report'

async function PolicyContent() {
  let policies: Awaited<ReturnType<typeof getCompliancePolicies>> = []
  let isAdmin = false
  try {
    isAdmin = (await getInventoryViewerRole()) === 'admin'
    if (isAdmin) policies = await getCompliancePolicies()
  } catch (error) {
    if (!(error instanceof InventoryReadError)) throw error
    return (
      <div role="alert" className="space-y-3">
        <p className="text-sm text-subtle">
          {error.code === 'unauthorized'
            ? 'Sign in to manage compliance parameters.'
            : 'Unable to load compliance parameters. Try again.'}
        </p>
        {error.code === 'read-failed' && <RefreshReport />}
      </div>
    )
  }
  if (!isAdmin)
    return (
      <p className="text-sm text-subtle">
        Only admins can edit global compliance parameters. View the current checks on the compliance
        status page.
      </p>
    )
  return <CompliancePolicyForm policies={policies} />
}

export function CompliancePolicyShell() {
  return (
    <div className="min-h-full bg-background">
      <div className="border-b border-border bg-background/90 md:sticky md:top-0 md:z-10">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">
              Compliance parameters
            </h1>
            <p className="mt-0.5 text-xs text-subtle">Global NTP and TACACS server policies</p>
          </div>
          <Button variant="ghost" asChild>
            <Link href="/inventory/compliance" prefetch={false}>
              View compliance status
            </Link>
          </Button>
        </div>
      </div>
      <div className="px-4 py-4 md:px-8 md:py-6">
        <Suspense
          fallback={
            <p className="text-sm text-subtle" role="status">
              Loading compliance parameters…
            </p>
          }
        >
          <PolicyContent />
        </Suspense>
      </div>
    </div>
  )
}
