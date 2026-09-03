import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { EpgFilterSkeleton, EpgHeaderActionsSkeleton, EpgResultsSkeleton } from './epgs-skeleton'

describe('EPG streaming shell', () => {
  it('has shape-matched skeleton regions', () => {
    expect(renderToStaticMarkup(<EpgHeaderActionsSkeleton />)).toContain('Loading EPG page actions')
    expect(renderToStaticMarkup(<EpgFilterSkeleton />)).toContain('Loading EPG filters')
    expect(renderToStaticMarkup(<EpgResultsSkeleton view="port" />)).toContain(
      'Loading port results',
    )
  })

  it('starts shared data promises in the synchronous shell', () => {
    const shellSource = readFileSync(
      path.join(process.cwd(), 'src/components/epgs/epg-shell.tsx'),
      'utf8',
    )
    expect(shellSource.match(/<Suspense/g)).toHaveLength(3)
    expect(shellSource).toContain('export function EpgShell')
    expect(shellSource).toContain('const overviewPromise')
    expect(shellSource).toContain('const resultsPromise')
    expect(shellSource).toContain('<EpgRegionError region="overview" />')
    expect(shellSource).toContain('<EpgToolbarClient')
  })

  it('consumes server-created promises in the interactive regions', () => {
    const shellSource = readFileSync(
      path.join(process.cwd(), 'src/components/epgs/epg-shell.tsx'),
      'utf8',
    )
    const pageSource = readFileSync(path.join(process.cwd(), 'src/app/(app)/epgs/page.tsx'), 'utf8')
    const filterSource = readFileSync(
      path.join(process.cwd(), 'src/components/epgs/epg-filters.tsx'),
      'utf8',
    )
    const headerSource = readFileSync(
      path.join(process.cwd(), 'src/components/epgs/epg-header-actions.tsx'),
      'utf8',
    )
    const resultsSource = readFileSync(
      path.join(process.cwd(), 'src/components/epgs/epg-results.tsx'),
      'utf8',
    )

    expect(shellSource).toContain('Deployed EPGs and their static port bindings')
    expect(shellSource).toContain('<EpgToolbarClient')
    expect(shellSource).toContain('<EpgHeaderActions')
    expect(shellSource).toContain('<EpgFilters')
    expect(shellSource).toContain('<EpgResults')
    const toolbarSource = readFileSync(
      path.join(process.cwd(), 'src/components/epgs/epg-toolbar-client.tsx'),
      'utf8',
    )
    expect(toolbarSource).toContain('<SearchBar')
    expect(pageSource).toContain('<EpgShell')
    expect(filterSource).toContain("'use client'")
    expect(filterSource).toContain('use(dataPromise)')
    expect(headerSource).toContain('use(dataPromise)')
    expect(resultsSource).toContain('use(dataPromise)')
  })

  it('renders the static toolbar before the host-dependent body without hiding the whole body', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/components/epgs/epg-shell.tsx'),
      'utf8',
    )
    const mainSource = source.slice(source.indexOf('<main'), source.indexOf('</main>'))
    expect(mainSource.indexOf('<EpgToolbarClient')).toBeGreaterThanOrEqual(0)
    expect(mainSource.indexOf('<EpgToolbarClient')).toBeLessThan(mainSource.indexOf('<EpgBody'))
    expect(mainSource).not.toContain('<Suspense')
  })

  it('removes obsolete forwarding wrappers', () => {
    expect(existsSync(path.join(process.cwd(), 'src/components/epgs/epgs-client.tsx'))).toBe(false)
    expect(existsSync(path.join(process.cwd(), 'src/components/epgs/epg-overview.tsx'))).toBe(false)
    for (const obsolete of [
      'epg-filters-client.tsx',
      'epg-header-actions-client.tsx',
      'epg-results-client.tsx',
      'epgs-view.tsx',
    ]) {
      expect(existsSync(path.join(process.cwd(), 'src/components/epgs', obsolete))).toBe(false)
    }
  })
})
