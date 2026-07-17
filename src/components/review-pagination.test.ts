import { describe, expect, it } from 'bun:test'
import { paginateReviewItems, REVIEW_PAGE_SIZE } from './review-pagination'

const items = Array.from({ length: 250 }, (_, index) => index + 1)

describe('paginateReviewItems', () => {
  it('returns an empty first page for an empty collection', () => {
    expect(paginateReviewItems([], 1)).toEqual({
      items: [],
      page: 1,
      totalPages: 1,
      rangeStart: 0,
      rangeEnd: 0,
    })
  })

  it('uses a fixed review page size of 100', () => {
    const page = paginateReviewItems(items, 1)

    expect(REVIEW_PAGE_SIZE).toBe(100)
    expect(page.items).toEqual(items.slice(0, 100))
    expect(page.rangeStart).toBe(1)
    expect(page.rangeEnd).toBe(100)
    expect(page.totalPages).toBe(3)
  })

  it('returns middle and final page ranges', () => {
    expect(paginateReviewItems(items, 2)).toMatchObject({
      items: items.slice(100, 200),
      page: 2,
      rangeStart: 101,
      rangeEnd: 200,
    })
    expect(paginateReviewItems(items, 3)).toMatchObject({
      items: items.slice(200),
      page: 3,
      rangeStart: 201,
      rangeEnd: 250,
    })
  })

  it('clamps underflow and overflow page requests', () => {
    expect(paginateReviewItems(items, 0).page).toBe(1)
    expect(paginateReviewItems(items, 99).page).toBe(3)
  })
})
