import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'bun:test'

import { LegacyMac } from './LegacyEndpointsClient'

describe('LegacyMac', () => {
  it('prefixes reported markers and omits an empty marker', () => {
    expect(renderToStaticMarkup(
      <LegacyMac macFlag="*" mac="00:11:22:33:44:55" />,
    )).toContain('* 00:11:22:33:44:55')
    expect(renderToStaticMarkup(
      <LegacyMac macFlag="+" mac="00:11:22:33:44:55" />,
    )).toContain('+ 00:11:22:33:44:55')
    expect(renderToStaticMarkup(
      <LegacyMac macFlag="" mac="00:11:22:33:44:55" />,
    )).toBe('00:11:22:33:44:55')
  })
})
