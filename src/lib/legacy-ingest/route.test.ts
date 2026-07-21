import { describe, expect, it } from 'bun:test'
import { z } from 'zod'
import { legacyInterfacePayloadSchema } from '@/lib/schemas/legacy-ingest'
import { IdempotencyConflictError, type LegacyIngestResult } from './common'
import { handleLegacyIngestRequest } from './route'

const valid = {
  schema_version: 1,
  run_id: '18d187a6-6509-40bd-b246-cc3798780efa',
  collected_at: '2026-07-21T14:30:00+07:00',
  complete: true,
  device: {
    site: 'jakarta', hostname: 'sw1',
    management_ip: '10.0.0.1', device_type: 'cisco_ios',
  },
}

const created: LegacyIngestResult = {
  receipt_id: 'r1', duplicate: false, device_id: 'd1',
  counts: { inserted: 1, updated: 0, cleared: 0, samples: 1 },
}

function request(body: unknown, token = 'secret') {
  return new Request('http://localhost/api/ingest/legacy/health', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const schema = z.object({
  schema_version: z.literal(1),
  run_id: z.string().uuid(),
  collected_at: z.string(),
  complete: z.literal(true),
  device: z.object({
    site: z.string(), hostname: z.string(),
    management_ip: z.string(), device_type: z.string(),
  }),
}).passthrough()
const deps = {
  token: 'secret',
  audit: async () => undefined,
}

describe('handleLegacyIngestRequest', () => {
  it('rejects missing server configuration and invalid authorization', async () => {
    const unconfigured = await handleLegacyIngestRequest(
      request(valid), schema, async () => created, 'ingest.legacy.health',
      { ...deps, token: undefined },
    )
    expect(unconfigured.status).toBe(503)

    const unauthorized = await handleLegacyIngestRequest(
      request(valid, 'wrong'), schema, async () => created, 'ingest.legacy.health', deps,
    )
    expect(unauthorized.status).toBe(401)
  })

  it('maps malformed JSON, oversized arrays, and validation failures', async () => {
    const malformed = new Request('http://localhost', {
      method: 'POST', headers: { authorization: 'Bearer secret' }, body: '{',
    })
    expect((await handleLegacyIngestRequest(
      malformed, schema, async () => created, 'ingest.legacy.health', deps,
    )).status).toBe(400)

    expect((await handleLegacyIngestRequest(
      request({ ...valid, interfaces: Array.from({ length: 20_001 }, () => ({})) }),
      legacyInterfacePayloadSchema,
      async () => created,
      'ingest.legacy.interfaces',
      deps,
    )).status).toBe(413)

    expect((await handleLegacyIngestRequest(
      request({ nope: true }), schema, async () => created, 'ingest.legacy.health', deps,
    )).status).toBe(422)
  })

  it('returns 201 for new receipts and 200 for duplicates', async () => {
    expect((await handleLegacyIngestRequest(
      request(valid), schema, async () => created, 'ingest.legacy.health', deps,
    )).status).toBe(201)
    expect((await handleLegacyIngestRequest(
      request(valid), schema, async () => ({ ...created, duplicate: true }),
      'ingest.legacy.health', deps,
    )).status).toBe(200)
  })

  it('maps idempotency conflicts and unexpected failures', async () => {
    expect((await handleLegacyIngestRequest(
      request(valid), schema, async () => { throw new IdempotencyConflictError() },
      'ingest.legacy.health', deps,
    )).status).toBe(409)
    expect((await handleLegacyIngestRequest(
      request(valid), schema, async () => { throw new Error('database password leaked') },
      'ingest.legacy.health', deps,
    )).status).toBe(500)
  })
})
