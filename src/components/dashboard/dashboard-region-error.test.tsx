import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('DashboardRegionError', () => {
  it('offers an accessible transition-based retry without hiding other regions', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/components/dashboard/dashboard-region-error.tsx'),
      'utf8',
    )

    expect(source).toContain("'use client'")
    expect(source).toContain('role="alert"')
    expect(source).toContain('router.refresh()')
    expect(source).toContain('useTransition()')
    expect(source).toContain('The rest of the dashboard is still available.')
  })
})
