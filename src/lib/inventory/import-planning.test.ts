import { describe, expect, it } from 'bun:test'
import {
  buildNewRackPlan,
  rackIdentityKey,
  requiredRackHeight,
} from './import-planning'

describe('rackIdentityKey', () => {
  it('matches an omitted site to a persisted rack under the Default site', () => {
    expect(rackIdentityKey(null, 'R1')).toBe('default::r1')
  })

  it('uses one collision key for omitted and explicit Default sites', () => {
    expect(rackIdentityKey(null, 'R1')).toBe(rackIdentityKey('Default', 'r1'))
  })
})

describe('requiredRackHeight', () => {
  it('defaults new racks to 42U and grows them through 60U', () => {
    expect(requiredRackHeight(1, 1)).toBe(42)
    expect(requiredRackHeight(43, 1)).toBe(43)
    expect(requiredRackHeight(59, 2)).toBe(60)
  })

  it('does not grow a rack for an unmounted device', () => {
    expect(requiredRackHeight(null, 60)).toBe(42)
  })

  it('rejects placements above 60U', () => {
    expect(() => requiredRackHeight(60, 2)).toThrow('exceeds maximum rack height')
  })
})

describe('buildNewRackPlan', () => {
  it('derives rack height from valid rows only', () => {
    const plan = buildNewRackPlan([
      {
        row: { site: 'DC1', rack: 'R1', rackPosition: 43, heightU: 1 },
        rackStatus: 'WILL_CREATE',
        errors: [],
      },
      {
        row: { site: 'DC1', rack: 'R1', rackPosition: 60, heightU: 1 },
        rackStatus: 'WILL_CREATE',
        errors: ['Invalid serial number'],
      },
    ])

    expect(plan).toEqual([
      { key: 'dc1::r1', siteName: 'DC1', rackName: 'R1', heightU: 43 },
    ])
  })

  it('does not plan a rack referenced only by invalid rows', () => {
    const plan = buildNewRackPlan([
      {
        row: { site: null, rack: 'Invalid-only', rackPosition: 50, heightU: 1 },
        rackStatus: 'WILL_CREATE',
        errors: ['Invalid serial number'],
      },
    ])

    expect(plan).toEqual([])
  })
})
