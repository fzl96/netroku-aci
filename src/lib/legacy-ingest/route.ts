import type { z } from 'zod'
import type { AuditAction } from '@/lib/audit'
import { recordLegacyRunAudit } from './run-audit'
import { invalidateLegacyDeviceReads } from '@/lib/legacy/devices/mutation'
import { isLegacyIngestAuthorized } from './auth'
import { IdempotencyConflictError, type LegacyIngestResult } from './common'

interface RoutePayload {
  run_id: string
  device: { site: string; hostname: string }
}

interface RouteDependencies {
  token?: string
  audit?: typeof recordLegacyRunAudit
  /** Expires the purpose caches this payload invalidates. Defaults to the
   *  device reads that every legacy feature payload touches. */
  invalidateReads?: () => void
}

function collectionTooLarge(error: z.ZodError): boolean {
  return error.issues.some(
    (issue) =>
      issue.code === 'too_big' &&
      ['logs', 'interfaces', 'endpoints'].includes(String(issue.path[0])),
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
    // A cache-expiry failure must not turn a committed ingestion into a 500.
    try {
      ;(dependencies.invalidateReads ?? invalidateLegacyDeviceReads)()
    } catch (error) {
      console.error('[legacy-ingest] failed to expire cached reads', error)
    }
    await (dependencies.audit ?? recordLegacyRunAudit)({
      runId: parsed.data.run_id,
      device: parsed.data.device,
      action,
      result,
    })
    return Response.json(result, { status: result.duplicate ? 200 : 201 })
  } catch (error) {
    await (dependencies.audit ?? recordLegacyRunAudit)({
      runId: parsed.data.run_id,
      device: parsed.data.device,
      action,
      error: error instanceof IdempotencyConflictError ? error.message : 'Legacy ingestion failed',
    })
    if (error instanceof IdempotencyConflictError) {
      return Response.json({ error: error.message }, { status: 409 })
    }
    return Response.json({ error: 'Legacy ingestion failed' }, { status: 500 })
  }
}
