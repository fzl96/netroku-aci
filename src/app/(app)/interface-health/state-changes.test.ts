import { describe, expect, it } from 'vitest'
import {
  findStateChangedInterfaceIds,
  isRecentLinkStateChange,
  isOperDown,
} from './state-changes'

describe('state-changes helpers', () => {
  describe('findStateChangedInterfaceIds', () => {
    it('detects operSt or adminSt changes between samples', () => {
      const now = new Date()
      const t1 = new Date(now.getTime() - 60000)
      const t2 = new Date(now.getTime() - 30000)

      const samples = [
        { interfaceId: 'if-1', sampledAt: t1, adminSt: 'up', operSt: 'up' },
        { interfaceId: 'if-1', sampledAt: t2, adminSt: 'up', operSt: 'down' }, // changed
        { interfaceId: 'if-2', sampledAt: t1, adminSt: 'up', operSt: 'up' },
        { interfaceId: 'if-2', sampledAt: t2, adminSt: 'up', operSt: 'up' }, // unchanged
      ]

      const changed = findStateChangedInterfaceIds(samples)
      expect(changed.has('if-1')).toBe(true)
      expect(changed.has('if-2')).toBe(false)
    })
  })

  describe('isRecentLinkStateChange', () => {
    it('returns true if lastLinkStChg is after windowStart', () => {
      const now = new Date()
      const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const recent = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
      const old = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)

      expect(isRecentLinkStateChange(recent, windowStart)).toBe(true)
      expect(isRecentLinkStateChange(old, windowStart)).toBe(false)
      expect(isRecentLinkStateChange(null, windowStart)).toBe(false)
    })
  })

  describe('isOperDown', () => {
    it('flags oper down ports', () => {
      expect(isOperDown('up', 'down')).toBe(true)
      expect(isOperDown('up', 'up')).toBe(false)
      expect(isOperDown('down', 'down')).toBe(true)
    })
  })
})
