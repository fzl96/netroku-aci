import { legacyHealthPayloadSchema } from '@/lib/schemas/legacy-ingest'
import { ingestLegacyHealth } from '@/lib/legacy-ingest/health'
import { handleLegacyIngestRequest } from '@/lib/legacy-ingest/route'

export function POST(request: Request) {
  return handleLegacyIngestRequest(
    request,
    legacyHealthPayloadSchema,
    ingestLegacyHealth,
    'ingest.legacy.health',
  )
}
