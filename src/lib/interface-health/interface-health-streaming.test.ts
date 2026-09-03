import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(relative: string): string {
  return readFileSync(path.join(root, relative), 'utf8')
}

describe('interface health streaming architecture', () => {
  it('keeps the route adapter synchronous and framework-only', () => {
    const page = read('src/app/(app)/interface-health/page.tsx')
    expect(page).toContain('export default function Page')
    expect(page).not.toContain('export default async function')
    expect(page).not.toContain('getSession')
    expect(page).not.toContain('redirect')
  })

  it('renders the purpose view synchronously with independent regions', () => {
    const view = read('src/components/interface-health/interface-health-view.tsx')
    expect(view).toContain('export function InterfaceHealthView')
    expect(view).not.toContain('export async function InterfaceHealthView')
    // Sync stamp, header actions, controls, node filter, summary, trend, and
    // results each suspend on their own so a slow dataset cannot block the
    // others; the eighth boundary resolves the trend's own fallback.
    expect(view.match(/<Suspense/g)).toHaveLength(8)
    expect(view).toContain('<InterfaceControls')
    expect(view).toContain('<InterfaceNodeFilter')
    expect(view).toContain('<InterfaceSummary')
    expect(view).toContain('<InterfaceCrcTrend')
    expect(view).toContain('<InterfaceResults')
  })

  it('shares one host resolution across every region', () => {
    const view = read('src/components/interface-health/interface-health-view.tsx')
    expect(view.match(/resolveInterfaceHost\(/g)).toHaveLength(1)
    expect(view).toContain('hostPromise')
  })

  it('shares the CRC window promise between the trend and table results', () => {
    const view = read('src/components/interface-health/interface-health-view.tsx')
    expect(view).toContain('Promise.all([paramsPromise, hostPromise, crcWindowPromise])')
    expect(view).toContain(
      'getInterfaceResults({ ...params, hostId: resolution.host.id }, crcWindow)',
    )
  })

  it('provides accessible shape-matched fallbacks', () => {
    const skeleton = read('src/components/interface-health/interface-health-skeleton.tsx')
    expect(skeleton).toContain('aria-busy="true"')
    expect(skeleton).toContain('Loading interface filters')
    expect(skeleton).toContain('Loading interface results')
    expect(skeleton).toContain('Loading node filter')
    expect(skeleton).toContain('Array.from({ length: 12 })')
  })

  it('offers a regional retry rather than failing the whole page', () => {
    const error = read('src/components/interface-health/interface-region-error.tsx')
    expect(error).toContain('router.refresh()')
    expect(error).toContain('Retry')
    expect(error).toContain('role="alert"')
  })

  it('routes drawer detail reads through an authenticated route, not an action', () => {
    const drawer = read('src/components/interface-health/interface-error-trend-drawer.tsx')
    expect(drawer).not.toContain('@/actions/')
    expect(drawer).toContain('./interface-samples-request')
    expect(existsSync(path.join(root, 'src/app/api/interfaces/samples/route.ts'))).toBe(true)
  })
})
