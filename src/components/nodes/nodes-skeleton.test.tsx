import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { NodeHeaderActionsSkeleton, NodeOverviewSkeleton, NodeResultsSkeleton, NodeTrendSkeleton } from './nodes-skeleton'

describe('node regional skeletons', () => {
  it('exposes accessible busy labels for each independently streamed region', () => {
    const html = renderToStaticMarkup(<><NodeHeaderActionsSkeleton /><NodeOverviewSkeleton /><NodeTrendSkeleton /><NodeResultsSkeleton view="components" /></>)
    expect(html).toContain('Loading node page actions')
    expect(html).toContain('Loading node overview')
    expect(html).toContain('Loading node trend')
    expect(html).toContain('Loading component results')
    expect((html.match(/<th /g) ?? []).length).toBe(5)
  })
})
