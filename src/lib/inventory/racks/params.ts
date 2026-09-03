export type RawRacksParam = string | string[] | undefined
export type RawRacksSearchParams = { siteId?: RawRacksParam }

export type RacksParams = { siteId: string | undefined }

export function parseRacksSearchParams(raw: RawRacksSearchParams): RacksParams {
  const value = raw.siteId
  return { siteId: (Array.isArray(value) ? value[0] : value)?.trim() || undefined }
}
