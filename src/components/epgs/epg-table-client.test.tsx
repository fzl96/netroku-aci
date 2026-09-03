import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { EpgResultsData, EpgRow } from '@/lib/epgs/query'
import type { EpgPortSummary } from '@/lib/epgs/sort'
import { EpgTableClient } from './epg-table-client'

const pagination = { page: 1, pageSize: 50 as const, total: 2, totalPages: 1 }

function epgRow(id: string): EpgRow {
  return {
    id,
    apicHostId: 'host-1',
    dn: `uni/tn-test/ap-app/epg-${id}`,
    name: `EPG ${id}`,
    tenant: 'test',
    appProfile: 'app',
    description: '',
    bridgeDomain: 'bd',
    pcTag: '',
    preferredGroup: false,
    isolation: false,
    domains: [],
    providedContracts: [],
    consumedContracts: [],
    bindings: [],
  }
}

function portRow(id: string): EpgPortSummary {
  return {
    id,
    node: '101',
    port: `eth1/${id}`,
    pathType: 'port',
    epgCount: 1,
    tenants: ['test'],
    encaps: ['vlan-100'],
    modes: ['regular'],
    bindings: [],
  }
}

function renderTable(results: EpgResultsData) {
  return renderToStaticMarkup(
    <EpgTableClient results={results} onEpgSelect={() => {}} onPortSelect={() => {}} />,
  )
}

describe('EpgTableClient', () => {
  it('stagger-animates EPG rows from top to bottom', () => {
    const markup = renderTable({
      view: 'epg',
      rows: [epgRow('1'), epgRow('2')],
      pagination,
    })

    expect(markup.match(/animate-fade-up/g)).toHaveLength(2)
    expect(markup).toContain('animation-delay:0ms')
    expect(markup).toContain('animation-delay:20ms')
  })

  it('stagger-animates port rows from top to bottom', () => {
    const markup = renderTable({
      view: 'port',
      rows: [portRow('1'), portRow('2')],
      pagination,
    })

    expect(markup.match(/animate-fade-up/g)).toHaveLength(2)
    expect(markup).toContain('animation-delay:0ms')
    expect(markup).toContain('animation-delay:20ms')
  })
})
