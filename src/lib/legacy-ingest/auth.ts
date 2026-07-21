import { timingSafeEqual } from 'crypto'

export function isLegacyIngestAuthorized(
  authHeader: string | null,
  expectedToken: string,
): boolean {
  if (!authHeader?.startsWith('Bearer ')) return false
  const provided = Buffer.from(authHeader.slice('Bearer '.length))
  const expected = Buffer.from(expectedToken)
  if (provided.length !== expected.length) return false
  return timingSafeEqual(provided, expected)
}
