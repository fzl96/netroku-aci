import { describe, expect, it } from 'bun:test'
import {
  buildHistoryUrl,
  buildHistoryWhere,
  clampHistoryPage,
  parseHistoryPageParams,
} from './query'

describe('parseHistoryPageParams', () => {
  it('trims query and accepts a supported action and positive page', () => {
    expect(parseHistoryPageParams({
      query: '  switch  ',
      action: 'resync.interfaces',
      page: '3',
    })).toEqual({
      query: 'switch',
      action: 'resync.interfaces',
      page: 3,
    })
  })

  it('falls back for invalid actions and pages', () => {
    expect(parseHistoryPageParams({
      action: 'not-supported',
      page: '-4',
    })).toEqual({ query: '', action: 'all', page: 1 })
  })
})

describe('buildHistoryUrl', () => {
  it('omits defaults and preserves active filters while paging', () => {
    expect(buildHistoryUrl({ query: '', action: 'all', page: 1 })).toBe('/history')
    expect(buildHistoryUrl({
      query: '  admin  ',
      action: 'user.create',
      page: 2,
    })).toBe('/history?query=admin&action=user.create&page=2')
  })
})

describe('clampHistoryPage', () => {
  it('clamps the requested page to the matching result bounds', () => {
    expect(clampHistoryPage(8, 41)).toBe(3)
    expect(clampHistoryPage(2, 0)).toBe(1)
  })
})

describe('buildHistoryWhere', () => {
  it('searches text fields and matching human-readable action labels', () => {
    expect(buildHistoryWhere({ query: 'host add', action: 'all', page: 1 })).toEqual({
      OR: [
        { userName: { contains: 'host add', mode: 'insensitive' } },
        { target: { contains: 'host add', mode: 'insensitive' } },
        { detail: { contains: 'host add', mode: 'insensitive' } },
        { action: { in: ['apic_host.create'] } },
      ],
    })
  })

  it('combines an exact action filter with free-text search', () => {
    expect(buildHistoryWhere({
      query: 'failed',
      action: 'resync.interfaces',
      page: 1,
    })).toEqual({
      action: 'resync.interfaces',
      OR: [
        { userName: { contains: 'failed', mode: 'insensitive' } },
        { target: { contains: 'failed', mode: 'insensitive' } },
        { detail: { contains: 'failed', mode: 'insensitive' } },
      ],
    })
  })
})
