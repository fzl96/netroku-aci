import 'server-only'

import { revalidateTag } from 'next/cache'
import { invalidateLegacyDeviceReads } from '@/lib/legacy/devices/mutation'

/** Endpoint ingestion rewrites placement rows and touches the device's
 *  freshness stamps, so both purposes expire together. */
export function invalidateLegacyEndpointReads(): void {
  revalidateTag('legacy-endpoints:all', { expire: 0 })
  invalidateLegacyDeviceReads()
}
