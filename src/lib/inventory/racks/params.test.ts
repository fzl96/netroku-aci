import { describe, expect, it } from 'bun:test'
import { parseRacksSearchParams } from './params'

describe('parseRacksSearchParams', () => {
  it('trims a single value and treats blank as absent', () => {
    expect(parseRacksSearchParams({ siteId: ' s1 ' })).toEqual({ siteId: 's1' })
    expect(parseRacksSearchParams({ siteId: '' })).toEqual({ siteId: undefined })
    expect(parseRacksSearchParams({})).toEqual({ siteId: undefined })
  })

  it('takes the first value of a repeated search param', () => {
    expect(parseRacksSearchParams({ siteId: ['s1', 's2'] })).toEqual({ siteId: 's1' })
  })
})
