import { describe, expect, it } from 'bun:test'
import { computeDelta, parseInterfaceRows } from './interfaces'

const b = (n: string | number): bigint => BigInt(n)

describe('computeDelta', () => {
  it('returns null when previous is null (first sample)', () => {
    expect(computeDelta(b(100), null)).toBeNull()
  })

  it('returns the arithmetic difference for monotonic counters', () => {
    expect(computeDelta(b(150), b(100))).toBe(b(50))
    expect(computeDelta(b(100), b(100))).toBe(b(0))
  })

  it('returns null on counter reset (current < previous)', () => {
    expect(computeDelta(b(50), b(100))).toBeNull()
    expect(computeDelta(b(0), b(1))).toBeNull()
  })

  it('handles very large BigInts without overflow', () => {
    const a = b('18000000000000000000')
    const c = b('17999999999999999000')
    expect(computeDelta(a, c)).toBe(b(1000))
  })
})

describe('parseInterfaceRows', () => {
  it('returns an empty array for empty input', () => {
    expect(parseInterfaceRows([])).toEqual([])
  })

  it('parses node and ifName out of the DN', () => {
    const rows = parseInterfaceRows([
      {
        l1PhysIf: {
          attributes: {
            dn: 'topology/pod-1/node-201/sys/phys-[eth1/4]',
            id: 'eth1/4',
            adminSt: 'up',
            usage: 'epg',
            descr: '',
          },
          children: [],
        },
      },
    ])
    expect(rows[0].node).toBe('201')
    expect(rows[0].ifName).toBe('eth1/4')
    expect(rows[0].usage).toBe('epg')
    expect(rows[0].adminSt).toBe('up')
  })

  it('reads counters from rmon classes nested under ethpmPhysIf', () => {
    const rows = parseInterfaceRows([
      {
        l1PhysIf: {
          attributes: {
            dn: 'topology/pod-1/node-101/sys/phys-[eth1/1]',
            id: 'eth1/1',
            adminSt: 'up',
            usage: 'epg',
            descr: 'uplink to host',
          },
          children: [
            {
              ethpmPhysIf: {
                attributes: {
                  operSt: 'up',
                  operSpeed: '25G',
                  lastLinkStChg: '2026-05-01T00:00:00.000Z',
                },
                children: [
                  {
                    rmonIfIn: {
                      attributes: {
                        octets: '1234567890',
                        ucastPkts: '100',
                        nUcastPkts: '7',
                        errors: '7',
                        discards: '3',
                      },
                    },
                  },
                  {
                    rmonIfOut: {
                      attributes: {
                        octets: '987654321',
                        ucastPkts: '80',
                        nUcastPkts: '0',
                        errors: '0',
                        discards: '1',
                      },
                    },
                  },
                  { rmonDot3Stats: { attributes: { fCSErrors: '42', alignmentErrors: '6' } } },
                ],
              },
            },
          ],
        },
      },
    ])

    const row = rows[0]
    expect(row.operSt).toBe('up')
    expect(row.operSpeed).toBe('25G')
    expect(row.lastLinkStChg?.toISOString()).toBe('2026-05-01T00:00:00.000Z')
    expect(row.rxBytes).toBe(b(1234567890))
    expect(row.rxPkts).toBe(b(107))
    expect(row.rxErrors).toBe(b(7))
    expect(row.rxDiscards).toBe(b(3))
    expect(row.rxCrcErrors).toBe(b(42))
    expect(row.rxAlignErrors).toBe(b(6))
    expect(row.txBytes).toBe(b(987654321))
    expect(row.txPkts).toBe(b(80))
    expect(row.txErrors).toBe(b(0))
    expect(row.txDiscards).toBe(b(1))
    expect(row.description).toBe('uplink to host')
  })

  it('falls back to rmonEtherStats.cRCAlignErrors when rmonDot3Stats.alignmentErrors is missing', () => {
    const rows = parseInterfaceRows([
      {
        l1PhysIf: {
          attributes: {
            dn: 'topology/pod-1/node-101/sys/phys-[eth1/2]',
            id: 'eth1/2',
            adminSt: 'up',
            usage: '',
            descr: '',
          },
          children: [
            {
              ethpmPhysIf: {
                attributes: {},
                children: [
                  { rmonDot3Stats: { attributes: { fCSErrors: '4' } } },
                  { rmonEtherStats: { attributes: { cRCAlignErrors: '9' } } },
                ],
              },
            },
          ],
        },
      },
    ])
    expect(rows[0].rxCrcErrors).toBe(b(4))
    expect(rows[0].rxAlignErrors).toBe(b(9))
  })

  it('also handles rmon children flattened directly under l1PhysIf (defensive)', () => {
    // Some MIT response shapes — particularly when querying via /api/mo with
    // certain subtree options — flatten the tree. We should still find them.
    const rows = parseInterfaceRows([
      {
        l1PhysIf: {
          attributes: {
            dn: 'topology/pod-1/node-101/sys/phys-[eth1/3]',
            id: 'eth1/3',
            adminSt: 'up',
            usage: 'epg',
            descr: '',
          },
          children: [
            { rmonIfIn: { attributes: { octets: '500', ucastPkts: '3', nUcastPkts: '1', errors: '11', discards: '0' } } },
            { rmonIfOut: { attributes: { octets: '600', ucastPkts: '4', nUcastPkts: '1', errors: '0', discards: '0' } } },
          ],
        },
      },
    ])
    expect(rows[0].rxBytes).toBe(b(500))
    expect(rows[0].rxPkts).toBe(b(4))
    expect(rows[0].rxErrors).toBe(b(11))
    expect(rows[0].txBytes).toBe(b(600))
  })

  it('coerces a malformed lastLinkStChg to null', () => {
    const rows = parseInterfaceRows([
      {
        l1PhysIf: {
          attributes: {
            dn: 'topology/pod-1/node-101/sys/phys-[eth1/9]',
            id: 'eth1/9',
            adminSt: 'up',
            usage: '',
            descr: '',
          },
          children: [
            {
              ethpmPhysIf: {
                attributes: { operSt: 'down', operSpeed: 'unknown', lastLinkStChg: 'not-a-date' },
              },
            },
          ],
        },
      },
    ])
    expect(rows[0].lastLinkStChg).toBeNull()
  })

  it('skips items without an l1PhysIf payload', () => {
    const rows = parseInterfaceRows([{} as Parameters<typeof parseInterfaceRows>[0][number]])
    expect(rows).toEqual([])
  })
})
