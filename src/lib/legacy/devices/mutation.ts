import 'server-only'

import { revalidateTag } from 'next/cache'

/** Every legacy ingestion upserts its device row (freshness stamps at minimum),
 *  so device reads expire whenever any feature payload lands. */
export function invalidateLegacyDeviceReads(): void {
  revalidateTag('legacy-devices:all', { expire: 0 })
}
