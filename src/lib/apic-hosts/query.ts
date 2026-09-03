import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { AuthenticationRequiredError, requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const APIC_HOSTS_CACHE_SECONDS = 28_800
const APIC_HOSTS_TAG = 'apic-hosts:all'

export type SafeApicHost = {
  id: string
  name: string
  host: string
  createdAt: Date
  updatedAt: Date
}

export type ApicHostReadErrorCode = 'unauthorized' | 'read-failed'

export class ApicHostReadError extends Error {
  constructor(
    readonly code: ApicHostReadErrorCode = 'unauthorized',
    options?: ErrorOptions,
  ) {
    super(code === 'unauthorized' ? 'Unauthorized' : 'Unable to load APIC hosts', options)
    this.name = 'ApicHostReadError'
  }
}

export function toSafeApicHost(host: SafeApicHost): SafeApicHost {
  return {
    id: host.id,
    name: host.name,
    host: host.host,
    createdAt: host.createdAt,
    updatedAt: host.updatedAt,
  }
}

/** Wrapped in React `cache()`: the app layout resolves this once per request
 *  to feed every page's `ApicHostsProvider`, and the `/apic-hosts` page
 *  resolves it again for its own render — one request should do one read. */
export const getApicHosts = cache(async (): Promise<SafeApicHost[]> => {
  try {
    await requireSession()
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error
    throw new ApicHostReadError()
  }

  try {
    return await unstable_cache(async () => {
      const hosts = await prisma.apicHost.findMany({ orderBy: { createdAt: 'desc' } })
      return hosts.map(toSafeApicHost)
    }, ['apic-hosts', 'all'], { tags: [APIC_HOSTS_TAG], revalidate: APIC_HOSTS_CACHE_SECONDS })()
  } catch (error) {
    if (error instanceof ApicHostReadError) throw error
    throw new ApicHostReadError('read-failed', { cause: error })
  }
})
