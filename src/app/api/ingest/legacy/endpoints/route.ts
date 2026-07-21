import { legacyEndpointPayloadSchema } from '@/lib/schemas/legacy-ingest'
import { ingestLegacyEndpoints } from '@/lib/legacy-ingest/endpoints'
import { handleLegacyIngestRequest } from '@/lib/legacy-ingest/route'

export function POST(request: Request) {
  return handleLegacyIngestRequest(
    request,
    legacyEndpointPayloadSchema,
    ingestLegacyEndpoints,
    'ingest.legacy.endpoints',
  )
}
