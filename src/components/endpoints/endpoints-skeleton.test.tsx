import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { EndpointOverviewSkeleton, EndpointResultsSkeleton } from './endpoints-skeleton'

describe('Endpoint skeletons', () => {
  it('matches the overview controls and status summary shape', () => {
    const markup = renderToStaticMarkup(<EndpointOverviewSkeleton />)

    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain('Loading endpoint filters and totals')
    expect(markup).toContain('data-endpoint-overview-controls="true"')
    expect(markup).toContain('data-endpoint-overview-stats="true"')
  })

  it('matches the endpoint and port result-table shapes independently', () => {
    const endpointMarkup = renderToStaticMarkup(<EndpointResultsSkeleton view="endpoint" />)
    const portMarkup = renderToStaticMarkup(<EndpointResultsSkeleton view="port" />)

    expect(endpointMarkup).toContain('Loading endpoint results')
    expect(endpointMarkup.match(/data-skeleton-column=/g)).toHaveLength(9)
    expect(portMarkup).toContain('Loading port results')
    expect(portMarkup.match(/data-skeleton-column=/g)).toHaveLength(6)
    expect(endpointMarkup).toContain('data-endpoint-result-cards="true"')
  })
})

describe('Endpoints streaming shell', () => {
  it('starts shared data promises in a synchronous shell with independent boundaries', () => {
    const shellSource = readFileSync(
      path.join(process.cwd(), 'src/components/endpoints/endpoints-shell.tsx'),
      'utf8',
    )

    // Results have an inner, view-specific fallback once host resolution finishes.
    expect(shellSource.match(/<Suspense/g)).toHaveLength(4)
    expect(shellSource).toContain('export function EndpointsShell')
    expect(shellSource).not.toContain('export async function EndpointsShell')
    expect(shellSource).toContain('const pagePromise')
    expect(shellSource).toContain('const overviewPromise')
    expect(shellSource).toContain('const resultsPromise')
    expect(shellSource.match(/getEndpointResults\(/g)).toHaveLength(1)
    expect(shellSource).toContain('<EndpointHeaderActionsSkeleton')
    expect(shellSource).toContain('<EndpointOverviewSkeleton')
    expect(shellSource).toContain('<EndpointResultsSkeleton')

    const mainSource = shellSource.slice(
      shellSource.indexOf('<main'),
      shellSource.indexOf('</main>'),
    )
    // Sibling boundaries allow static content and other regions to stream independently.
    expect(mainSource.match(/<Suspense /g)).toHaveLength(2)
    expect(mainSource.match(/<\/Suspense>/g)).toHaveLength(2)
  })

  it('consumes server-created promises in focused client regions', () => {
    for (const component of [
      'endpoint-header-actions.tsx',
      'endpoint-overview.tsx',
      'endpoint-results.tsx',
    ]) {
      const source = readFileSync(
        path.join(process.cwd(), 'src/components/endpoints', component),
        'utf8',
      )
      expect(source).toContain("'use client'")
      expect(source).toContain('use(dataPromise)')
    }
  })

  it('uses serializable endpoint payload states across the server-client boundary', () => {
    const querySource = readFileSync(path.join(process.cwd(), 'src/lib/endpoints/query.ts'), 'utf8')

    expect(querySource).toContain('export type EndpointLoadState<T>')
    expect(querySource).toContain('export type EndpointOverviewPayload')
    expect(querySource).toContain('filteredTotal: number')
    expect(querySource).toContain('export type EndpointResultsPayload')
  })

  it('routes directly to the shell and removes superseded wrappers', () => {
    const pageSource = readFileSync(
      path.join(process.cwd(), 'src/app/(app)/endpoints/page.tsx'),
      'utf8',
    )

    expect(pageSource).toContain("from '@/components/endpoints/endpoints-shell'")
    expect(pageSource).toContain('<EndpointsShell')
    expect(
      existsSync(path.join(process.cwd(), 'src/components/endpoints/endpoints-view.tsx')),
    ).toBe(false)
    expect(
      existsSync(path.join(process.cwd(), 'src/components/endpoints/endpoints-client.tsx')),
    ).toBe(false)
  })
})
