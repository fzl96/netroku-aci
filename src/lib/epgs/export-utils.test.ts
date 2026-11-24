import { describe, expect, it } from 'bun:test'
import { epgExportSchema } from '@/lib/schemas/epg-export'
import { buildEpgExportPayload } from './export-utils'

describe('EPG details-only export requests', () => {
  it.each(['detailed', 'summary'] as const)('accepts the %s format', (groupBy) => {
    expect(
      epgExportSchema.parse(
        buildEpgExportPayload({ apicHostId: 'h1', scope: 'all', groupBy, filters: {} }),
      ),
    ).toEqual({ apicHostId: 'h1', scope: 'all', groupBy })
  })
  const filters = {
    query: 'web',
    dn: 'uni/tn-T1/ap-app/epg-web',
    tenant: ['T1'],
    ap: ['app'],
    contract: ['web-contract'],
    node: ['101'],
  }

  it.each(['all', 'filtered'] as const)('accepts the %s scope through API validation', (scope) => {
    const payload = buildEpgExportPayload({
      apicHostId: 'host-1',
      scope,
      groupBy: 'epg-details',
      filters,
    })

    expect(epgExportSchema.parse(payload)).toEqual({
      apicHostId: 'host-1',
      scope,
      groupBy: 'epg-details',
      ...(scope === 'filtered' ? { filters } : {}),
    })
  })
})
