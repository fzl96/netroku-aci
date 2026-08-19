import { describe, expect, it } from 'bun:test'
import { requiredRackHeight } from './import-planning'

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
