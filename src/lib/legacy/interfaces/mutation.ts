import 'server-only'

import { revalidateTag } from 'next/cache'
import { invalidateLegacyDeviceReads } from '@/lib/legacy/devices/mutation'

/** Interface ingestion rewrites snapshots and appends samples while touching
 *  the device's freshness stamps, so both purposes expire together. */
export function invalidateLegacyInterfaceReads(): void {
  revalidateTag('legacy-interfaces:all', { expire: 0 })
  invalidateLegacyDeviceReads()
}
