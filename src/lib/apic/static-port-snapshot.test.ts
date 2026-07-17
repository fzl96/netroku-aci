import { describe, expect, it } from 'bun:test'
import {
  bindingLookupKey,
  loadStaticPortSnapshot,
  type StaticPortSnapshotRequirements,
} from './static-port-snapshot'
import type { ApicFetcher } from './read-cache'

const EPG_BASE = '/api/node/class/fvAEPg.json?rsp-subtree=children&rsp-subtree-class=fvRsPathAtt'
const NODE_BASE = '/api/node/class/fabricNode.json'
const BUNDLE_BASE = '/api/node/class/infraAccBndlGrp.json'
const PHYSICAL_BASE = '/api/node/class/fabricPathEp.json'

const epgDn = 'uni/tn-TenantA/ap-AppA/epg-Web'
const pathDn = 'topology/pod-1/protpaths-101-102/pathep-[WEB-VPC]'
const bindingDn = `${epgDn}/rspathAtt-[${pathDn}]`

function pageNumber(path: string): number {
  return Number(new URL(`https://apic.local${path}`).searchParams.get('page'))
}

function requirements(
  overrides: Partial<StaticPortSnapshotRequirements> = {},
): StaticPortSnapshotRequirements {
  return { nodes: false, bundles: false, physicalPaths: false, ...overrides }
}

describe('loadStaticPortSnapshot', () => {
  it('parses APIC managed objects into compact lookup indexes', async () => {
    const calls: string[] = []
    const fetcher: ApicFetcher = async (_host, path) => {
      calls.push(path)
      if (path.startsWith(EPG_BASE)) {
        return Response.json({
          totalCount: '1',
          imdata: [{
            fvAEPg: {
              attributes: { dn: epgDn },
              children: [{
                fvRsPathAtt: {
                  attributes: { dn: bindingDn, tDn: pathDn, encap: 'vlan-100' },
                },
              }],
            },
          }],
        })
      }
      if (path.startsWith(NODE_BASE)) {
        return Response.json({
          totalCount: '2',
          imdata: [
            { fabricNode: { attributes: { id: '101', dn: 'topology/pod-1/node-101' } } },
            { fabricNode: { attributes: { dn: 'topology/pod-1/node-102' } } },
          ],
        })
      }
      if (path.startsWith(BUNDLE_BASE)) {
        return Response.json({
          totalCount: '1',
          imdata: [{ infraAccBndlGrp: { attributes: { name: 'WEB-VPC' } } }],
        })
      }
      if (path.startsWith(PHYSICAL_BASE)) {
        return Response.json({
          totalCount: '1',
          imdata: [{
            fabricPathEp: {
              attributes: { dn: 'topology/pod-1/paths-101/pathep-[eth1/1]' },
            },
          }],
        })
      }
      return new Response('unexpected path', { status: 500 })
    }

    const snapshot = await loadStaticPortSnapshot(
      'apic.local',
      'token',
      requirements({ nodes: true, bundles: true, physicalPaths: true }),
      fetcher,
    )

    expect(snapshot.epgBindings.ok).toBe(true)
    if (snapshot.epgBindings.ok) {
      expect(snapshot.epgBindings.value.epgDns.has(epgDn)).toBe(true)
      expect(snapshot.epgBindings.value.bindingsByDn.get(bindingDn)).toEqual({
        tDn: pathDn,
        encap: 'vlan-100',
      })
      expect(snapshot.epgBindings.value.bindingDnsByPathAndEncap.get(
        bindingLookupKey(pathDn, 'vlan-100'),
      )).toEqual([bindingDn])
    }
    expect(snapshot.nodes.ok && snapshot.nodes.value).toEqual(new Set([101, 102]))
    expect(snapshot.bundles.ok && snapshot.bundles.value).toEqual(new Set(['WEB-VPC']))
    expect(snapshot.physicalPaths.ok && snapshot.physicalPaths.value).toEqual(
      new Set(['topology/pod-1/paths-101/pathep-[eth1/1]']),
    )
    expect(calls).toHaveLength(4)
  })

  it('loads exactly the pages implied by a valid totalCount', async () => {
    const calls: string[] = []
    const fetcher: ApicFetcher = async (_host, path) => {
      calls.push(path)
      const page = pageNumber(path)
      return Response.json({
        totalCount: '5001',
        imdata: [{
          fvAEPg: { attributes: { dn: `${epgDn}-${page}` } },
        }],
      })
    }

    const snapshot = await loadStaticPortSnapshot(
      'apic.local',
      'token',
      requirements(),
      fetcher,
    )

    expect(calls.map(pageNumber)).toEqual([0, 1])
    expect(snapshot.epgBindings.ok).toBe(true)
    if (snapshot.epgBindings.ok) {
      expect(snapshot.epgBindings.value.epgDns).toEqual(new Set([`${epgDn}-0`, `${epgDn}-1`]))
    }
  })

  it('stops after page zero when totalCount is missing or malformed', async () => {
    for (const totalCount of [undefined, 'not-a-number']) {
      const calls: string[] = []
      const fetcher: ApicFetcher = async (_host, path) => {
        calls.push(path)
        return Response.json({ totalCount, imdata: [] })
      }

      await loadStaticPortSnapshot('apic.local', 'token', requirements(), fetcher)

      expect(calls.map(pageNumber)).toEqual([0])
    }
  })

  it('invalidates a component when a later page fails', async () => {
    const fetcher: ApicFetcher = async (_host, path) => {
      if (pageNumber(path) === 1) return new Response('page unavailable', { status: 503 })
      return Response.json({
        totalCount: '5001',
        imdata: [{ fvAEPg: { attributes: { dn: epgDn } } }],
      })
    }

    const snapshot = await loadStaticPortSnapshot(
      'apic.local',
      'token',
      requirements(),
      fetcher,
    )

    expect(snapshot.epgBindings).toEqual({
      ok: false,
      status: 503,
      error: 'page unavailable',
    })
  })

  it('does not request optional inventories that are not required', async () => {
    const calls: string[] = []
    const fetcher: ApicFetcher = async (_host, path) => {
      calls.push(path)
      return Response.json({ totalCount: '0', imdata: [] })
    }

    const snapshot = await loadStaticPortSnapshot(
      'apic.local',
      'token',
      requirements(),
      fetcher,
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].startsWith(EPG_BASE)).toBe(true)
    expect(snapshot.nodes.ok && snapshot.nodes.value.size).toBe(0)
    expect(snapshot.bundles.ok && snapshot.bundles.value.size).toBe(0)
    expect(snapshot.physicalPaths.ok && snapshot.physicalPaths.value.size).toBe(0)
  })
})
