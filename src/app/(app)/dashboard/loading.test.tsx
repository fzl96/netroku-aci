import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'bun:test'

import DashboardLoading from './loading'

describe('DashboardLoading', () => {
  it('renders an accessible dashboard skeleton while data is loading', () => {
    const html = renderToStaticMarkup(<DashboardLoading />)

    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Loading dashboard')
    expect(html).toContain('data-slot="skeleton"')
  })
})
