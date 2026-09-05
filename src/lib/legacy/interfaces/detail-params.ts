// URL state for the single-interface detail page. Kept separate from the list
// page's state: the detail route shares no filters with the table, only the
// sample range it charts and which page of that range it lists.

import { parseLegacyPage, parseLegacyRange, type LegacyRange } from '@/lib/legacy/query'

export type RawLegacyInterfaceDetailParam = string | string[] | undefined
export type RawLegacyInterfaceDetailParams = {
  range?: RawLegacyInterfaceDetailParam
  page?: RawLegacyInterfaceDetailParam
  from?: RawLegacyInterfaceDetailParam
}

export type LegacyInterfaceDetailParams = {
  range: LegacyRange
  page: number
  /** The filtered list to return to, carried from the row that was clicked so
   *  leaving does not discard the reader's filters. Empty when arriving cold. */
  backUrl: string
}

function first(value: RawLegacyInterfaceDetailParam): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

/** `from` arrives on the query string, so it is only honoured when it names the
 *  interfaces list itself. Anything else would make the back link an open
 *  redirect. */
function backUrl(value: string): string {
  if (value === '/legacy/interfaces' || value.startsWith('/legacy/interfaces?')) return value
  return ''
}

export function parseLegacyInterfaceDetailParams(
  input: RawLegacyInterfaceDetailParams,
): LegacyInterfaceDetailParams {
  return {
    range: parseLegacyRange(first(input.range)),
    page: parseLegacyPage(first(input.page) || undefined),
    backUrl: backUrl(first(input.from)),
  }
}

export function buildLegacyInterfaceDetailUrl(
  interfaceId: string,
  params: Partial<LegacyInterfaceDetailParams> = {},
): string {
  const search = new URLSearchParams()
  if (params.range && params.range !== '24h') search.set('range', params.range)
  if (params.page && params.page > 1) search.set('page', String(params.page))
  if (params.backUrl) search.set('from', params.backUrl)
  const value = search.toString()
  return `/legacy/interfaces/${encodeURIComponent(interfaceId)}${value ? `?${value}` : ''}`
}
