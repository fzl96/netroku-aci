import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('EpgRegionError', () => {
  it('renders an accessible retry control and preserves regional context', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/components/epgs/epg-region-error.tsx'),
      'utf8',
    )

    expect(source).toContain('role="alert"')
    expect(source).toContain('Could not load EPG {region}')
    expect(source).toContain('router.refresh()')
    expect(source).toContain("retrying ? 'Retrying…' : 'Retry'")
  })
})
