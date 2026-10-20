import { describe, expect, it } from 'bun:test'
import { parseBdRows } from './bd-inventory'
import { fetchApicClassPages } from './inventory-pages'

const bd = (tenant: string, name = 'shared', children: unknown[] = []) => ({
  fvBD: {
    attributes: { dn: `uni/tn-${tenant}/BD-${name}`, name, unicastRoute: 'no', arpFlood: 'yes' },
    children,
  },
})
const epg = (tenant: string, relation: Record<string, string>) => ({
  fvAEPg: {
    attributes: { dn: `uni/tn-${tenant}/ap-app/epg-web`, name: 'web' },
    children: [{ fvRsBd: { attributes: relation } }],
  },
})

describe('Bridge Domain inventory', () => {
  it('preserves multiple subnets and forwarding settings, including unknown flags', () => {
    const [row] = parseBdRows(
      [
        bd('T1', 'shared', [
          { fvRsCtx: { attributes: { tnFvCtxName: 'VRF', tDn: 'uni/tn-common/ctx-VRF' } } },
          {
            fvSubnet: {
              attributes: {
                ip: '10.0.0.1/24',
                scope: 'public,shared',
                preferred: 'yes',
                ctrl: 'querier',
                ipDPLearning: 'disabled',
              },
            },
          },
          { fvSubnet: { attributes: { ip: '2001:db8::1/64', scope: 'private' } } },
          { fvRsBDToOut: { attributes: { tnL3extOutName: 'WAN' } } },
          { fvRsBDToOut: { attributes: { tnL3extOutName: 'DMZ' } } },
        ]),
      ],
      [],
    )
    expect(row).toMatchObject({
      tenant: 'T1',
      vrf: 'VRF',
      vrfDn: 'uni/tn-common/ctx-VRF',
      unicastRoute: false,
      arpFlood: true,
      ipLearning: null,
      l3Outs: ['DMZ', 'WAN'],
    })
    expect(row.subnets).toHaveLength(2)
    expect(row.subnets[0]).toMatchObject({
      scope: 'public,shared',
      preferred: true,
      ctrl: 'querier',
      ipDPLearning: 'disabled',
    })
    expect(row.subnets[1].preferred).toBeNull()
  })

  it('uses resolved target DNs across tenants and never attaches to a different same-named BD', () => {
    const rows = parseBdRows(
      [bd('T1'), bd('T2'), bd('common')],
      [
        epg('T1', { tnFvBDName: 'shared', tDn: 'uni/tn-common/BD-shared', state: 'formed' }),
        epg('T2', { tnFvBDName: 'shared', tDn: 'uni/tn-absent/BD-shared' }),
      ],
    )
    expect(rows.find((r) => r.tenant === 'common')?.epgs).toEqual([
      { dn: 'uni/tn-T1/ap-app/epg-web', name: 'web', tenant: 'T1', appProfile: 'app' },
    ])
    expect(rows.filter((r) => r.tenant !== 'common').every((r) => r.epgs.length === 0)).toBe(true)
  })

  it('resolves name-only relationships tenant-first, then common, excluding unformed relationships', () => {
    const rows = parseBdRows(
      [bd('T1'), bd('common')],
      [
        epg('T1', { tnFvBDName: 'shared' }),
        epg('T2', { tnFvBDName: 'shared' }),
        epg('T3', { tnFvBDName: 'shared', state: 'unformed' }),
      ],
    )
    expect(rows[0].epgs.map((e) => e.tenant)).toEqual(['T1'])
    expect(rows[1].epgs.map((e) => e.tenant)).toEqual(['T2'])
  })

  it('collects all APIC pages before returning a snapshot', async () => {
    const paths: string[] = []
    const rows = await fetchApicClassPages('fvBD', 'fvSubnet', async (path) => {
      paths.push(path)
      return { totalCount: '2', imdata: [bd(paths.length === 1 ? 'T1' : 'T2')] }
    })
    expect(rows).toHaveLength(2)
    expect(paths[0]).toContain('page=0')
    expect(paths[1]).toContain('page=1')
    expect(
      await fetchApicClassPages('fvBD', '', async () => ({ totalCount: '0', imdata: [] })),
    ).toEqual([])
  })

  it('rejects error envelopes, truncated pages, duplicate pages and changing inventories', async () => {
    for (const response of [
      { imdata: [{ error: { attributes: { code: '403' } } }] },
      { totalCount: '2', imdata: [] },
    ]) {
      await expect(fetchApicClassPages('fvBD', '', async () => response)).rejects.toThrow()
    }
    await expect(
      fetchApicClassPages('fvBD', '', async () => ({ totalCount: '2', imdata: [bd('T1')] })),
    ).rejects.toThrow('duplicate')
    let page = 0
    await expect(
      fetchApicClassPages('fvBD', '', async () => ({
        totalCount: String(++page === 1 ? 2 : 3),
        imdata: [bd(String(page))],
      })),
    ).rejects.toThrow('changed')
    expect(() => parseBdRows([{ fvBD: { attributes: { dn: 'invalid' } } }], [])).toThrow('DN')
  })
})
