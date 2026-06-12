import { timingSafeEqual } from 'crypto'

export type DatasetResult = { synced: number; total: number } | { error: string }

export interface HostResult {
  apicHostId: string | null
  host: string | null
  endpoints?: DatasetResult
  interfaces?: DatasetResult
  /** Set when the host entry failed before any dataset ran (bad input / host not found). */
  error?: string
}

/** Constant-time check of an `Authorization: Bearer <token>` header. */
export function isAuthorized(authHeader: string | null, expectedToken: string): boolean {
  if (!authHeader) return false
  const prefix = 'Bearer '
  if (!authHeader.startsWith(prefix)) return false
  const provided = Buffer.from(authHeader.slice(prefix.length))
  const expected = Buffer.from(expectedToken)
  if (provided.length !== expected.length) return false
  return timingSafeEqual(provided, expected)
}

function datasetSucceeded(result: DatasetResult | undefined): boolean | null {
  if (!result) return null
  return !('error' in result)
}

/**
 * Reduce per-host results to an overall status.
 * Each dataset that ran, plus each host-level error, counts as one unit.
 * all-ok -> success, all-failed -> failure, mixed (or empty) -> partial/failure.
 */
export function summarizeResults(results: HostResult[]): 'success' | 'partial' | 'failure' {
  const units: boolean[] = []
  for (const r of results) {
    if (r.error) {
      units.push(false)
      continue
    }
    for (const d of [r.endpoints, r.interfaces]) {
      const ok = datasetSucceeded(d)
      if (ok !== null) units.push(ok)
    }
  }
  if (units.length === 0) return 'failure'
  const okCount = units.filter(Boolean).length
  if (okCount === units.length) return 'success'
  if (okCount === 0) return 'failure'
  return 'partial'
}
