import { describe, expect, it } from 'bun:test'
import { buildInterfaceSnapshotWhere } from './interface-query'

describe('buildInterfaceSnapshotWhere', () => {
  const windowStart = new Date('2026-07-10T00:00:00Z')

  it('ANDs the state-change and search OR groups', () => {
    expect(buildInterfaceSnapshotWhere({
      apicHostId: 'host-1',
      view: 'state-changed',
      windowStart,
      stateChangedInterfaceIds: ['if-1'],
      nodeFilter: [],
      query: 'eth1/10',
    })).toEqual({
      apicHostId: 'host-1',
      AND: [
        {
          OR: [
            { lastLinkStChg: { gte: windowStart } },
            { id: { in: ['if-1'] } },
          ],
        },
        {
          OR: [
            { ifName: { contains: 'eth1/10', mode: 'insensitive' } },
            { node: { contains: 'eth1/10', mode: 'insensitive' } },
            { description: { contains: 'eth1/10', mode: 'insensitive' } },
            { dn: { contains: 'eth1/10', mode: 'insensitive' } },
          ],
        },
      ],
    })
  })

  it('omits the search group when the query is blank', () => {
    const where = buildInterfaceSnapshotWhere({
      apicHostId: 'host-1',
      view: 'state-changed',
      windowStart,
      stateChangedInterfaceIds: [],
      nodeFilter: [],
      query: '   ',
    })

    expect(where.AND).toEqual([
      {
        OR: [
          { lastLinkStChg: { gte: windowStart } },
          { id: { in: [] } },
        ],
      },
    ])
  })

  it('preserves CRC and node constraints', () => {
    expect(buildInterfaceSnapshotWhere({
      apicHostId: 'host-1',
      view: 'crc',
      windowStart,
      stateChangedInterfaceIds: [],
      crcInterfaceIds: ['if-2'],
      nodeFilter: ['101'],
    })).toEqual({
      apicHostId: 'host-1',
      id: { in: ['if-2'] },
      node: { in: ['101'] },
    })
  })
})
