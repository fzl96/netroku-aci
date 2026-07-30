import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HistoryResultsSkeleton } from './HistoryResultsSkeleton'

describe('HistoryResultsSkeleton', () => {
  it('renders an accessible results-only loading state', () => {
    const html = renderToStaticMarkup(<HistoryResultsSkeleton />)

    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Loading history')
    expect(html).toContain('data-slot="skeleton"')
    expect(html).not.toContain('Search user, target, detail')
  })
})
