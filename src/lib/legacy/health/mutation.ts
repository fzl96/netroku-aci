import 'server-only'

import { revalidateTag } from 'next/cache'
import { invalidateLegacyDeviceReads } from '@/lib/legacy/devices/mutation'

/** Health ingestion writes samples and logs and refreshes the device's
 *  freshness stamps, so both purposes expire together. */
export function invalidateLegacyHealthReads(): void {
  revalidateTag('legacy-health:all', { expire: 0 })
  invalidateLegacyDeviceReads()
}
