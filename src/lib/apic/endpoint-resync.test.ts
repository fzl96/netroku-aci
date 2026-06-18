import { describe, expect, it } from 'bun:test'
import type { ApicEndpointRow } from './endpoints'
import { epgKeyFromDn, planEndpointResync, type ActiveEndpoint } from './endpoint-resync'

function active(overrides: Partial<ActiveEndpoint> = {}): ActiveEndpoint {
  return {
    id: 'ep-1',
    mac: 'aa:bb:cc:dd:ee:ff',
    ip: '10.0.0.1',
    vlan: 'vlan-100',
    dn: 'uni/tn-t/ap-a/epg-web/cep-aa:bb:cc:dd:ee:ff',
    node: '101',
    interface: 'eth1/1',
    epgDescr: 'Web',
    ...overrides,
  }
}

function fetched(overrides: Partial<ApicEndpointRow> = {}): ApicEndpointRow {
  return {
    mac: 'aa:bb:cc:dd:ee:ff',
    ip: '10.0.0.1',
    vlan: 'vlan-100',
    dn: 'uni/tn-t/ap-a/epg-web/cep-aa:bb:cc:dd:ee:ff',
    node: '101',
    interface: 'eth1/1',
    epgDescr: 'Web',
    ...overrides,
  }
}

describe('epgKeyFromDn', () => {
  it('strips the trailing /cep-<mac> segment', () => {
    expect(epgKeyFromDn('uni/tn-t/ap-a/epg-web/cep-aa:bb:cc:dd:ee:ff'))
      .toBe('uni/tn-t/ap-a/epg-web')
  })

  it('returns the dn unchanged when there is no cep segment', () => {
    expect(epgKeyFromDn('uni/tn-t/ap-a/epg-web')).toBe('uni/tn-t/ap-a/epg-web')
  })
})

describe('planEndpointResync', () => {
  it('inserts brand-new endpoints with no active row', () => {
    const plan = planEndpointResync([], [fetched()])
    expect(plan.inserts).toEqual([fetched()])
    expect(plan.bumps).toEqual([])
    expect(plan.relabels).toEqual([])
    expect(plan.clears).toEqual([])
  })

  it('bumps unchanged endpoints with no new rows (idempotent resync)', () => {
    const plan = planEndpointResync([active()], [fetched()])
    expect(plan.inserts).toEqual([])
    expect(plan.bumps).toEqual(['ep-1'])
    expect(plan.relabels).toEqual([])
    expect(plan.clears).toEqual([])
  })

  it('clears the old row and inserts a new one on a node move', () => {
    const plan = planEndpointResync([active()], [fetched({ node: '102' })])
    expect(plan.clears).toEqual(['ep-1'])
    expect(plan.inserts).toEqual([fetched({ node: '102' })])
    expect(plan.bumps).toEqual([])
  })

  it('treats interface, vlan, and epg-dn changes as moves', () => {
    expect(planEndpointResync([active()], [fetched({ interface: 'eth1/2' })]).inserts).toHaveLength(1)
    expect(planEndpointResync([active()], [fetched({ vlan: 'vlan-200' })]).inserts).toHaveLength(1)
    expect(planEndpointResync(
      [active()],
      [fetched({ dn: 'uni/tn-t/ap-a/epg-db/cep-aa:bb:cc:dd:ee:ff' })],
    ).inserts).toHaveLength(1)
  })

  it('relabels in place when only epgDescr differs (not a move)', () => {
    const plan = planEndpointResync([active()], [fetched({ epgDescr: 'Web Tier' })])
    expect(plan.relabels).toEqual([{ id: 'ep-1', epgDescr: 'Web Tier' }])
    expect(plan.inserts).toEqual([])
    expect(plan.clears).toEqual([])
  })

  it('clears active rows that are absent from the fetch (left the fabric)', () => {
    const plan = planEndpointResync([active()], [])
    expect(plan.clears).toEqual(['ep-1'])
    expect(plan.inserts).toEqual([])
    expect(plan.bumps).toEqual([])
  })

  it('keeps the one-active-per-key invariant: every insert key was empty or cleared', () => {
    const rows = [active({ id: 'ep-1', mac: 'a', ip: '1' })]
    const plan = planEndpointResync(rows, [
      fetched({ mac: 'a', ip: '1', node: '999' }), // move -> clear ep-1 + insert
      fetched({ mac: 'b', ip: '2' }),               // new -> insert
    ])
    expect(plan.clears).toEqual(['ep-1'])
    expect(plan.inserts.map(r => `${r.mac}|${r.ip}`)).toEqual(['a|1', 'b|2'])
  })
})
