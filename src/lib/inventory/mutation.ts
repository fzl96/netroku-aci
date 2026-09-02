import 'server-only'

import { revalidateTag } from 'next/cache'
import { INVENTORY_TAG } from './cache'

/** Every inventory purpose's cached reads share one tag (see `cache.ts`), so
 *  every durable write — in any purpose — expires all of them together. */
export function invalidateInventoryReads(): void {
  revalidateTag(INVENTORY_TAG, { expire: 0 })
}
