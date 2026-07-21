import type { z } from 'zod'
import { recordAudit, type AuditAction } from '@/lib/audit'
import { isLegacyIngestAuthorized } from './auth'
import {
  IdempotencyConflictError,
  type LegacyIngestResult,
} from './common'

interface RoutePayload {
  run_id: string
  device: { site: string; hostname: string }
}

interface RouteDependencies {
  token?: string
  audit?: typeof recordAudit
}

function collectionTooLarge(error: z.ZodError): boolean {
  return error.issues.some(issue =>
    issue.code === 'too_big'
    && ['logs', 'interfaces', 'endpoints'].includes(String(issue.path[0])),
  )
}

export async function handleLegacyIngestRequest<T extends RoutePayload>(
  request: Request,
  schema: z.ZodType<T>,
  ingest: (payload: T) => Promise<LegacyIngestResult>,
  action: AuditAction,
  dependencies: RouteDependencies = {},
): Promise<Response> {
  const token = Object.prototype.hasOwnProperty.call(dependencies, 'token')
    ? dependencies.token
    : process.env.LEGACY_INGEST_TOKEN
  if (!token) {
    return Response.json({ error: 'Legacy ingestion is not configured' }, { status: 503 })
  }
  if (!isLegacyIngestAuthorized(request.headers.get('authorization'), token)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: collectionTooLarge(parsed.error) ? 'Collection limit exceeded' : 'Invalid payload' },
      { status: collectionTooLarge(parsed.error) ? 413 : 422 },
    )
  }

  try {
    const result = await ingest(parsed.data)
    const audit = dependencies.audit ?? recordAudit
    await audit({
      userId: null,
      userName: 'legacy-collector',
      action,
      target: `${parsed.data.device.site}/${parsed.data.device.hostname}`,
      detail: `run ${parsed.data.run_id}: inserted ${result.counts.inserted}, updated ${result.counts.updated}, cleared ${result.counts.cleared}, samples ${result.counts.samples}`,
    })
    return Response.json(result, { status: result.duplicate ? 200 : 201 })
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      return Response.json({ error: error.message }, { status: 409 })
    }
    return Response.json({ error: 'Legacy ingestion failed' }, { status: 500 })
  }
}
