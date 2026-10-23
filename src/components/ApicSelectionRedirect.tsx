'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useApicSelection } from '@/components/ApicSelectionProvider'
import { apicSelectionUrl } from '@/lib/apic-selection'

/** Server-validated hosts let browser preferences resolve missing/deleted IDs. */
export function ApicSelectionRedirect({ hostIds }: { hostIds: string[] }) {
  const { ready, resolve } = useApicSelection()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const hostId = resolve(hostIds)
  const destination = hostId ? apicSelectionUrl(pathname, params.toString(), hostId) : null

  useEffect(() => {
    if (ready && destination) router.replace(destination, { scroll: false })
  }, [ready, destination, router])

  return (
    <p role="status" className="py-8 text-center text-xs text-subtle">
      Loading APIC…
    </p>
  )
}
