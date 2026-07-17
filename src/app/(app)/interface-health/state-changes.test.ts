import { describe, expect, it } from 'vitest'
import {
  isRecentLinkStateChange,
  isOperDown,
} from './state-changes'

describe('state-changes helpers', () => {
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
