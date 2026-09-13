import { describe, expect, it } from 'bun:test'
import { searchPages } from './pages'
import { documentationResults } from './docs'
import { escapeLike, normalizedMac, isRecordGroup } from './types'
import { serializeSearchResult, type SearchRow } from './results'
import { parseEpgPageParams, buildEpgPageUrl } from '@/lib/epgs/params'
import { parseNodePageParams, buildNodePageUrl } from '@/lib/nodes/params'
import { parseLegacyDevicePageParams, buildLegacyDevicePageUrl } from '@/lib/legacy/devices/params'
import { parseEndpointPageParams } from '@/lib/endpoints/params'
import { parseLegacyEndpointPageParams } from '@/lib/legacy/endpoints/params'

const row: SearchRow = {
  id: 'row-1',
  title: 'web',
  detail: '192.0.2.1',
  sourceId: 'host & 1',
  sourceName: 'APIC One',
  identity: 'uni/tn-A/ap-B/epg-C',
  active: true,
  matches: 1,
}

describe('global search navigation', () => {
  it('shares navigation while excluding actions, expanders and restricted pages', () => {
    const member = searchPages('', 'member', 'host 1').flatMap((group) => group.items)
    expect(member.some((item) => /logout|users|scheduler|apic-hosts/.test(item.href))).toBe(false)
    expect(member.some((item) => item.href === '/bridge-domains')).toBe(false)
    expect(member.some((item) => item.href === '/endpoints?apic=host+1')).toBe(true)
    expect(member.some((item) => item.href === '/legacy/endpoints')).toBe(true)
    expect(searchPages('users', 'admin').flatMap((group) => group.items)).toHaveLength(1)
    expect(searchPages('users', 'member')).toHaveLength(0)
  })
  it('round trips stable EPG identity and reveals selections on page one', () => {
    const result = serializeSearchResult('epgs', row, false)
    const params = parseEpgPageParams({
      ...Object.fromEntries(new URL(result.href, 'http://test').searchParams),
      page: '99',
    })
    expect(params.selected).toBe(row.identity)
    expect(params.page).toBe(1)
    expect(new URL(buildEpgPageUrl(params), 'http://test').searchParams.get('selected')).toBe(
      row.identity,
    )
    expect(parseNodePageParams({ selected: 'node-1', page: '99' }).page).toBe(1)
    expect(buildNodePageUrl(parseNodePageParams({ selected: 'node-1' }))).toContain(
      'selected=node-1',
    )
    expect(
      buildLegacyDevicePageUrl(parseLegacyDevicePageParams({ selected: 'device-1' })),
    ).toContain('selected=device-1')
  })
  it('explicitly preserves endpoint lifecycle across different page defaults', () => {
    for (const history of [false, true]) {
      const aci = new URL(
        serializeSearchResult('aci-endpoints', { ...row, identity: 'aa:bb:cc:dd:ee:ff' }, history)
          .href,
        'http://test',
      )
      const legacy = new URL(
        serializeSearchResult(
          'legacy-endpoints',
          { ...row, identity: 'aa:bb:cc:dd:ee:ff' },
          history,
        ).href,
        'http://test',
      )
      expect(parseEndpointPageParams(Object.fromEntries(aci.searchParams)).statuses).toEqual(
        history ? [] : ['active'],
      )
      expect(
        parseLegacyEndpointPageParams(Object.fromEntries(legacy.searchParams)).statuses,
      ).toEqual(history ? [] : ['active'])
      expect(aci.searchParams.get('mac')).toBe('aa:bb:cc:dd:ee:ff')
      expect(legacy.searchParams.get('mac')).toBe('aa:bb:cc:dd:ee:ff')
      expect(aci.searchParams.get('query')).toBeNull()
      expect(aci.searchParams.get('apic')).toBe(row.sourceId)
      expect(legacy.searchParams.get('device')).toBe(row.sourceId)
    }
  })
  it('normalizes MAC separators and escapes literal SQL wildcards', () => {
    expect(normalizedMac('AABB.CCDD.EEFF')).toBe('aabbccddeeff')
    expect(normalizedMac('aa-bb-cc')).toBe('aabbcc')
    expect(normalizedMac('leaf-1')).toBeNull()
    expect(escapeLike('a_%\\')).toBe('a\\_\\%\\\\')
    expect(isRecordGroup('__proto__')).toBe(false)
  })
  it('deduplicates documentation articles, preserves heading destinations and rejects unsafe links', () => {
    expect(
      documentationResults([
        { url: '/docs/search#example', content: '<mark>Search</mark>', breadcrumbs: ['Guide'] },
        { url: '/docs/search#other', content: 'Duplicate article' },
        { url: 'javascript:alert(1)', content: 'bad' },
        { url: '//evil.example/docs', content: 'bad' },
        { url: '/docs-evil', content: 'bad' },
      ]),
    ).toEqual([
      {
        id: '/docs/search#example',
        title: 'Search',
        description: 'Guide',
        href: '/docs/search#example',
      },
    ])
  })
})
