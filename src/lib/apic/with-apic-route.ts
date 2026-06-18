import { auth } from '@/lib/auth'
import { recordAudit, type AuditStatus } from '@/lib/audit'

function deriveFeature(featureSegs: string[]): string {
  if (featureSegs.length === 0) return 'static-ports'
  if (featureSegs[0] === 'interface-selectors') return 'interface-selectors'
  if (featureSegs[0] === 'bridge-domains') {
    if (featureSegs[1] === 'epgs') {
      return featureSegs[2] ? `epg:${featureSegs[2]}` : 'epg'
    }
    return featureSegs[1] ? `bridge-domains:${featureSegs[1]}` : 'bridge-domains'
  }
  return featureSegs.join(':')
}

async function logDeployRollback(
  request: Request,
  rows: unknown[],
  apicHost: string,
  results: unknown[],
): Promise<void> {
  try {
    const segments = new URL(request.url).pathname.split('/').filter(Boolean)
    const action = segments[segments.length - 1]
    if (action !== 'deploy' && action !== 'rollback') return

    const apicIndex = segments.indexOf('apic')
    const featureSegs = segments.slice(apicIndex + 1, segments.length - 1)
    const feature = deriveFeature(featureSegs)

    const successCount = (results as { success?: boolean }[]).filter(r => r.success).length
    const failCount = results.length - successCount
    const status: AuditStatus =
      failCount === 0 ? 'success' : successCount === 0 ? 'failure' : 'partial'

    const session = await auth.api.getSession({ headers: request.headers })

    await recordAudit({
      userId: session?.user.id ?? null,
      userName: session?.user.username ?? session?.user.name ?? 'unknown',
      action,
      target: `${feature} @ ${apicHost}`,
      status,
      detail: `${successCount} succeeded, ${failCount} failed`,
      payload: rows,
    })
  } catch (err) {
    console.error('[audit] deploy/rollback logging failed', err)
  }
}

export function withApicRoute<TRow, TResult>(
  handler: (rows: TRow[], apicHost: string, apicToken: string) => Promise<TResult[]>,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    let rows: TRow[], apicHost: string, apicToken: string
    try {
      ;({ rows, apicHost, apicToken } = await request.json())
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 })
    }
    if (!Array.isArray(rows)) {
      return Response.json({ error: 'rows is required' }, { status: 400 })
    }
    if (!apicHost || !apicToken) {
      return Response.json({ error: 'apicHost and apicToken are required' }, { status: 400 })
    }
    const results = await handler(rows, apicHost, apicToken)
    await logDeployRollback(request, rows, apicHost, results)
    return Response.json({ results })
  }
}
