export const REVIEW_PAGE_SIZE = 100

export interface ReviewPage<T> {
  items: T[]
  page: number
  totalPages: number
  rangeStart: number
  rangeEnd: number
}

export function paginateReviewItems<T>(
  items: T[],
  requestedPage: number,
): ReviewPage<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / REVIEW_PAGE_SIZE))
  const page = Math.min(Math.max(1, requestedPage), totalPages)
  const startIndex = (page - 1) * REVIEW_PAGE_SIZE
  const pageItems = items.slice(startIndex, startIndex + REVIEW_PAGE_SIZE)

  return {
    items: pageItems,
    page,
    totalPages,
    rangeStart: items.length === 0 ? 0 : startIndex + 1,
    rangeEnd: Math.min(startIndex + pageItems.length, items.length),
  }
}
