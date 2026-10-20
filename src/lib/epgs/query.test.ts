import { describe, expect, it, mock } from 'bun:test'

mock.module('server-only', () => ({}))

const { buildEpgWhere, buildBindingWhere, countActiveEpgFilterGroups, expandNodeOptions } =
  await import('./query')

describe('buildEpgWhere', () => {
  it('scopes to host and maps filters', () => {
    const where = buildEpgWhere('h1', {
      tenant: ['t1'],
      ap: ['ap1'],
      query: 'web',
    })
    expect(where.apicHostId).toBe('h1')
    expect(where.tenant).toEqual({ in: ['t1'] })
    expect(where.appProfile).toEqual({ in: ['ap1'] })
    expect(where.OR).toBeDefined()
  })

  it('matches any provided or consumed contract while retaining search and other filters', () => {
    const where = buildEpgWhere('h1', {
      contract: ['web', 'api'],
      tenant: ['t1'],
      ap: ['ap1'],
      query: 'db',
    })
    expect(where).toMatchObject({
      apicHostId: 'h1',
      tenant: { in: ['t1'] },
      appProfile: { in: ['ap1'] },
      AND: [
        {
          OR: [
            { providedContracts: { hasSome: ['web', 'api'] } },
            { consumedContracts: { hasSome: ['web', 'api'] } },
          ],
        },
      ],
    })
    expect(where.OR).toContainEqual({ name: { contains: 'db', mode: 'insensitive' } })
    expect(buildEpgWhere('h1', { contract: [] })).toEqual({ apicHostId: 'h1' })
  })
})

describe('buildBindingWhere', () => {
  it('matches a leaf inside vPC pairs', () => {
    const where = buildBindingWhere('h1', { node: ['101'] })
    expect(where.AND).toEqual([
      {
        OR: [{ node: '101' }, { node: { startsWith: '101-' } }, { node: { endsWith: '-101' } }],
      },
    ])
  })

  it('applies tenant/ap through the epg relation', () => {
    const where = buildBindingWhere('h1', { tenant: ['t1'], ap: ['ap1'] })
    expect(where.epg).toEqual({ tenant: { in: ['t1'] }, appProfile: { in: ['ap1'] } })
  })

  it('restricts bindings to contract-matching EPGs alongside node and search filters', () => {
    const where = buildBindingWhere('h1', {
      contract: ['web', 'api'],
      tenant: ['t1'],
      node: ['101'],
      query: 'Eth1/1',
    })
    expect(where.epg).toMatchObject({
      tenant: { in: ['t1'] },
      AND: [
        {
          OR: [
            { providedContracts: { hasSome: ['web', 'api'] } },
            { consumedContracts: { hasSome: ['web', 'api'] } },
          ],
        },
      ],
    })
    expect(where.AND).toBeDefined()
    expect(where.OR).toContainEqual({ port: { contains: 'Eth1/1', mode: 'insensitive' } })
  })
})

describe('countActiveEpgFilterGroups', () => {
  it('counts non-empty filter groups', () => {
    expect(countActiveEpgFilterGroups({})).toBe(0)
    expect(countActiveEpgFilterGroups({ tenant: ['t'], node: ['101'] })).toBe(2)
  })
})

describe('expandNodeOptions', () => {
  it('splits pairs, dedupes and natural-sorts', () => {
    expect(expandNodeOptions(['101-102', '101', '99', '3113-3114'])).toEqual([
      '99',
      '101',
      '102',
      '3113',
      '3114',
    ])
  })
})

it('preserves exact search identity for filtered EPG and port exports', () => {
  expect(buildEpgWhere('host-1', { dn: 'uni/tn-A/ap-B/epg-C' })).toMatchObject({
    apicHostId: 'host-1',
    dn: 'uni/tn-A/ap-B/epg-C',
  })
  expect(buildBindingWhere('host-1', { dn: 'uni/tn-A/ap-B/epg-C' })).toMatchObject({
    apicHostId: 'host-1',
    epg: { dn: 'uni/tn-A/ap-B/epg-C' },
  })
})
