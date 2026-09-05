// URL state for the single-interface detail page. Kept separate from the list
// page's params: the detail route shares no filters with the table, only the
// sample range it charts and how much of the history it lists.

import { DEFAULT_ERROR_TREND_RANGE, ERROR_TREND_RANGES, type ErrorTrendRange } from './error-trend'

const RANGES = new Set<string>(ERROR_TREND_RANGES.map((range) => range.value))

/** A resync writes a sample every few minutes, so a month of history is tens of
 *  thousands of rows. The full list is capped rather than paginated — it is a
 *  fallback view, and the range selector is the real way to narrow it. */
export const HISTORY_ROW_LIMIT = 500

export type RawInterfaceDetailParam = string | string[] | undefined
export type RawInterfaceDetailParams = {
  range?: RawInterfaceDetailParam
  samples?: RawInterfaceDetailParam
  from?: RawInterfaceDetailParam
}

export type InterfaceDetailParams = {
  range: ErrorTrendRange
  /** History listing: transitions only (the default), or every stored sample. */
  changesOnly: boolean
  /** The filtered list to return to, carried from the row that was clicked so
   *  leaving does not discard the reader's filters. Empty when arriving cold. */
  backUrl: string
}

function first(value: RawInterfaceDetailParam): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

/** `from` arrives on the query string, so it is only honoured when it names the
 *  interfaces list itself. Anything else would turn the back link into an open
 *  redirect. */
function backUrl(value: string): string {
  if (value === '/interface-health' || value.startsWith('/interface-health?')) return value
  return ''
}

export function parseInterfaceDetailParams(input: RawInterfaceDetailParams): InterfaceDetailParams {
  const range = first(input.range)
  return {
    range: RANGES.has(range) ? (range as ErrorTrendRange) : DEFAULT_ERROR_TREND_RANGE,
    changesOnly: first(input.samples) !== 'all',
    backUrl: backUrl(first(input.from)),
  }
}

export function buildInterfaceDetailUrl(
  interfaceId: string,
  params: Partial<InterfaceDetailParams> = {},
): string {
  const search = new URLSearchParams()
  if (params.range && params.range !== DEFAULT_ERROR_TREND_RANGE) search.set('range', params.range)
  if (params.changesOnly === false) search.set('samples', 'all')
  if (params.backUrl) search.set('from', params.backUrl)
  const value = search.toString()
  return `/interface-health/${encodeURIComponent(interfaceId)}${value ? `?${value}` : ''}`
}
