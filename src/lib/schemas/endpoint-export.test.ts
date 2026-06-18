import { describe, expect, it } from 'bun:test'
import { endpointExportSchema } from './endpoint-export'

describe('endpointExportSchema', () => {
  it('accepts filtered exports with supported filters', () => {
    const parsed = endpointExportSchema.safeParse({
      apicHostId: 'host-1',
      scope: 'filtered',
      groupBy: 'node',
      filters: {
        query: 'aa:bb',
        vlan: ['vlan-100'],
        node: ['101'],
        iface: ['eth1/1'],
        status: ['active'],
      },
    })

    expect(parsed.success).toBe(true)
  })

  it('accepts unfiltered exports without filter payload', () => {
    const parsed = endpointExportSchema.safeParse({
      apicHostId: 'host-1',
      scope: 'all',
      groupBy: 'vlan',
    })

    expect(parsed.success).toBe(true)
  })

  it('rejects unsupported grouping and statuses', () => {
    const parsed = endpointExportSchema.safeParse({
      apicHostId: 'host-1',
      scope: 'filtered',
      groupBy: 'interface',
      filters: { status: ['deleted'] },
    })

    expect(parsed.success).toBe(false)
  })
})
