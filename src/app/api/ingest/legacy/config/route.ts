import { legacyConfigPayloadSchema } from '@/lib/schemas/legacy-ingest'
import { ingestLegacyConfig } from '@/lib/legacy-ingest/config'
import { invalidateInventoryReads } from '@/lib/inventory/mutation'
import { invalidateLegacyDeviceReads } from '@/lib/legacy/devices/mutation'
import { handleLegacyIngestRequest } from '@/lib/legacy-ingest/route'

export function POST(request: Request) {
  return handleLegacyIngestRequest(
    request,
    legacyConfigPayloadSchema,
    ingestLegacyConfig,
    'ingest.legacy.config',
    {
      invalidateReads: () => {
        invalidateInventoryReads()
        invalidateLegacyDeviceReads()
      },
    },
  )
}
