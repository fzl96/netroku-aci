import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  InterfaceControlsSkeleton,
  InterfaceCrcTrendSkeleton,
  InterfaceHeaderActionsSkeleton,
  InterfaceNodeFilterSkeleton,
  InterfaceResultsSkeleton,
  InterfaceSummarySkeleton,
} from './interface-health-skeleton'

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('interface health regional skeletons', () => {
  it('exposes accessible busy labels for each independently streamed region', () => {
    const html = renderToStaticMarkup(
      <>
        <InterfaceHeaderActionsSkeleton />
        <InterfaceControlsSkeleton />
        <InterfaceNodeFilterSkeleton />
        <InterfaceSummarySkeleton />
        <InterfaceCrcTrendSkeleton />
        <InterfaceResultsSkeleton />
      </>,
    )
    expect(html).toContain('Loading interface actions')
    expect(html).toContain('Loading interface filters')
    expect(html).toContain('Loading node filter')
    expect(html).toContain('Loading interface count')
    expect(html).toContain('Loading CRC trend')
    expect(html).toContain('Loading interface results')
  })
})

describe('interface health streaming shell', () => {
  it('starts shared data promises once in a synchronous shell with independent boundaries', () => {
    const shellSource = read('src/components/interface-health/interface-health-shell.tsx')

    expect(shellSource).toContain('export function InterfaceHealthShell')
    expect(shellSource).not.toContain('export async function InterfaceHealthShell')
    expect(shellSource).not.toContain('InterfaceHealthFrame')
    expect(shellSource).not.toContain('NavigationContext')
    expect(shellSource).not.toContain('createContext')
    expect(shellSource).not.toContain('useInterfaceNavigation')

    expect(shellSource).toContain('const pagePromise')
    expect(shellSource).toContain('const overviewPromise')
    expect(shellSource).toContain('const crcTrendPromise')
    expect(shellSource).toContain('const resultsPromise')
    expect(shellSource.match(/getInterfaceOverview\(/g)).toHaveLength(1)
    expect(shellSource.match(/getInterfaceCrcWindow\(/g)).toHaveLength(1)
    expect(shellSource.match(/getInterfaceResults\(/g)).toHaveLength(1)

    expect(shellSource).toContain('<InterfaceHeaderActionsSkeleton')
    expect(shellSource).toContain('<InterfaceControlsSkeleton')
    expect(shellSource).toContain('<InterfaceNodeFilterSkeleton')
    expect(shellSource).toContain('<InterfaceSummarySkeleton')
    expect(shellSource).toContain('<InterfaceCrcTrendSkeleton')
    expect(shellSource).toContain('<InterfaceResultsSkeleton')

    const mainSource = shellSource.slice(
      shellSource.indexOf('<main'),
      shellSource.indexOf('</main>'),
    )
    // Sibling boundaries allow static content and other regions to stream independently.
    expect(mainSource.match(/<Suspense /g)).toHaveLength(3)
    expect(mainSource.match(/<\/Suspense>/g)).toHaveLength(3)
  })

  it('shares one CRC window read between the trend chart and the results table', () => {
    const shellSource = read('src/components/interface-health/interface-health-shell.tsx')
    expect(shellSource).toContain('const crcWindowDataPromise')
    expect(shellSource.match(/crcWindowDataPromise/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  it('renders the CRC trend region only for the crc view, without a whole-body fallback', () => {
    const shellSource = read('src/components/interface-health/interface-health-shell.tsx')
    expect(shellSource).toContain("context.params.view !== 'crc'")
  })

  it('consumes server-created promises in focused client regions', () => {
    for (const component of [
      'interface-header-actions.tsx',
      'interface-controls.tsx',
      'interface-node-filter.tsx',
      'interface-summary.tsx',
      'interface-crc-trend.tsx',
      'interface-results.tsx',
    ]) {
      const source = read(path.join('src/components/interface-health', component))
      expect(source).toContain("'use client'")
      expect(source).toContain('use(')
    }
  })

  it('extracts the shared operational-state badge into its own module', () => {
    const badgeSource = read('src/components/interface-health/interface-status-badge.tsx')
    expect(badgeSource).toContain('export function OperStBadge')

    const resultsSource = read('src/components/interface-health/interface-results.tsx')
    const detailSource = read('src/components/interface-health/interface-detail-shell.tsx')
    expect(resultsSource).toContain("from './interface-status-badge'")
    expect(detailSource).toContain("from './interface-status-badge'")
    expect(resultsSource).not.toContain('interface-health-client')
    expect(detailSource).not.toContain('interface-health-client')
  })

  it('uses serializable interface payload states across the server-client boundary', () => {
    const querySource = read('src/lib/interface-health/query.ts')
    expect(querySource).toContain('export type InterfaceLoadState<T>')
    expect(querySource).toContain('export type InterfaceOverviewPayload')
    expect(querySource).toContain('export type InterfaceCrcTrendPayload')
    expect(querySource).toContain('export type InterfaceResultsPayload')
  })

  it('routes directly to the shell and removes superseded wrappers', () => {
    const pageSource = read('src/app/(app)/interface-health/page.tsx')
    expect(pageSource).toContain("from '@/components/interface-health/interface-health-shell'")
    expect(pageSource).toContain('<InterfaceHealthShell')
    expect(
      existsSync(
        path.join(process.cwd(), 'src/components/interface-health/interface-health-view.tsx'),
      ),
    ).toBe(false)
    expect(
      existsSync(
        path.join(process.cwd(), 'src/components/interface-health/interface-health-client.tsx'),
      ),
    ).toBe(false)
  })

  // The following four assertions were carried over from the deleted
  // src/lib/interface-health/interface-health-streaming.test.ts. That file's
  // other assertions referenced the removed interface-health-view.tsx/
  // interface-health-client.tsx and are obsolete post-refactor, but these
  // four still describe files this task left untouched (page.tsx's framework
  // constraints, the regional skeleton shapes, the region-error retry, and
  // the port-detail data path, since rewritten around the detail route that
  // replaced the drawer), so their coverage is preserved here rather than
  // dropped.

  it('keeps the route adapter synchronous and framework-only', () => {
    const pageSource = read('src/app/(app)/interface-health/page.tsx')
    expect(pageSource).toContain('export default function Page')
    expect(pageSource).not.toContain('export default async function')
    expect(pageSource).not.toContain('getSession')
    expect(pageSource).not.toContain('redirect')
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

  it('reads one interface through the query layer, not an action', () => {
    const detail = read('src/components/interface-health/interface-detail-shell.tsx')
    expect(detail).not.toContain('@/actions/')
    expect(detail).toContain("from '@/lib/interface-health/query'")
    // The drawer's browser-side transport went with it; nothing fetches port
    // detail from the client any more.
    expect(existsSync(path.join(process.cwd(), 'src/app/api/interfaces/samples/route.ts'))).toBe(
      false,
    )
  })

  it('opens an interface with a real link so rows are reachable by keyboard', () => {
    const results = read('src/components/interface-health/interface-results.tsx')
    expect(results).toContain('buildInterfaceDetailUrl')
    expect(results).toContain('prefetch={false}')
    expect(results).not.toContain('Drawer')
  })

  it('leaves the table standing while the detail route loads', () => {
    // The pending flag swaps rows for an in-place skeleton, which suits a
    // filter or sort. Reusing it for a row click stacked that skeleton behind
    // the detail route's own fallback.
    const results = read('src/components/interface-health/interface-results.tsx')
    expect(results).toContain('router.push(detailUrl(id))')
    expect(results).not.toContain('startTransition(() => router.push')
  })
})
