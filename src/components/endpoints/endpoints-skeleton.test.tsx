import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  EndpointOverviewSkeleton,
  EndpointResultsSkeleton,
} from './endpoints-skeleton'

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

describe('EndpointsView composition', () => {
  it('streams overview and results through separate Suspense boundaries', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/components/endpoints/endpoints-view.tsx'),
      'utf8',
    )

    expect(source.match(/<Suspense/g)).toHaveLength(3)
    expect(source).toContain('export function EndpointsView')
    expect(source).not.toContain('export async function EndpointsView')
    expect(source).toContain('<EndpointHeaderActionsSkeleton')
    expect(source).toContain('<EndpointOverviewSkeleton')
    expect(source).toContain('<EndpointResultsSkeleton')
  })
})
