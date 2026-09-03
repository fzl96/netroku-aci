import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { EpgHeaderActionsSkeleton, EpgOverviewSkeleton, EpgResultsSkeleton } from './epgs-skeleton'

describe('EPG streaming shell', () => {
  it('has shape-matched skeleton regions', () => {
    expect(renderToStaticMarkup(<EpgHeaderActionsSkeleton />)).toContain('Loading EPG page actions')
    expect(renderToStaticMarkup(<EpgOverviewSkeleton />)).toContain('Loading EPG filters')
    expect(renderToStaticMarkup(<EpgResultsSkeleton view="port" />)).toContain('Loading port results')
  })

  it('is synchronous, owns three data regions, and nests a view-aware result fallback', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/components/epgs/epgs-view.tsx'), 'utf8')
    expect(source.match(/<Suspense/g)).toHaveLength(4)
    expect(source).toContain('export function EpgsView')
    expect(source).not.toContain('export async function EpgsView')
    expect(source).toContain('<ResolvedEpgResultsSkeleton paramsPromise={paramsPromise}')
    expect(source).toContain('<EpgResultsSkeleton view={params.view}')
  })
})
