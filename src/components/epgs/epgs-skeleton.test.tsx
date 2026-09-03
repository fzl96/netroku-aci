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

  it('keeps the route adapter synchronous and nests fallbacks around data regions only', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/components/epgs/epg-shell.tsx'),
      'utf8',
    )
    expect(source.match(/<Suspense/g)).toHaveLength(3)
    expect(source).toContain('export function EpgShell')
    expect(source).toContain('EpgReadError')
    expect(source).toContain('<EpgRegionError region="overview" />')
    expect(source).toContain('<EpgToolbarClient')
    expect(source).toContain('<EpgResultsFallback paramsPromise={resolvedParams}')
    expect(source).toContain('<EpgResultsSkeleton view={params.view}')
  })

  it('keeps the static shell outside the page-wide client wrapper', () => {
    const shellSource = readFileSync(
      path.join(process.cwd(), 'src/components/epgs/epg-shell.tsx'),
      'utf8',
    )
    const viewSource = readFileSync(
      path.join(process.cwd(), 'src/components/epgs/epgs-view.tsx'),
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
    expect(viewSource).toContain('<EpgShell')
    expect(viewSource).not.toContain('<EpgsClient')
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

  it('removes the obsolete page-wide client wrapper', () => {
    expect(existsSync(path.join(process.cwd(), 'src/components/epgs/epgs-client.tsx'))).toBe(false)
    expect(existsSync(path.join(process.cwd(), 'src/components/epgs/epg-overview.tsx'))).toBe(false)
  })
})
