import { describe, expect, it } from 'bun:test'
import { buildHistoryUrl, parseHistoryPageParams } from './params'

describe('history page params', () => {
  it('normalizes repeated framework values once', () => {
    expect(
      parseHistoryPageParams({
        query: ['  switch  ', 'ignored'],
        action: ['resync.interfaces', 'deploy'],
        page: ['3', '9'],
      }),
    ).toEqual({ query: 'switch', action: 'resync.interfaces', page: 3 })
  })

  it('rejects partial and unsafe page numbers', () => {
    expect(parseHistoryPageParams({ page: '2junk' }).page).toBe(1)
    expect(parseHistoryPageParams({ page: '9007199254740992' }).page).toBe(1)
  })

  it('omits defaults and preserves normalized filters while paging', () => {
    expect(buildHistoryUrl({ query: '', action: 'all', page: 1 })).toBe('/history')
    expect(
      buildHistoryUrl({
        query: '  admin  ',
        action: 'user.create',
        page: 2,
      }),
    ).toBe('/history?query=admin&action=user.create&page=2')
  })
})
