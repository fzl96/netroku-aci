import { legacyInterfacePayloadSchema } from '@/lib/schemas/legacy-ingest'
import { ingestLegacyInterfaces } from '@/lib/legacy-ingest/interfaces'
import { invalidateLegacyInterfaceReads } from '@/lib/legacy/interfaces/mutation'
import { handleLegacyIngestRequest } from '@/lib/legacy-ingest/route'

export function POST(request: Request) {
  return handleLegacyIngestRequest(
    request,
    legacyInterfacePayloadSchema,
    ingestLegacyInterfaces,
    'ingest.legacy.interfaces',
    { invalidateReads: invalidateLegacyInterfaceReads },
  )
}
