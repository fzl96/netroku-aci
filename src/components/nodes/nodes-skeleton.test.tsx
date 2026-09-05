import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  NodeHeaderActionsSkeleton,
  NodeOverviewSkeleton,
  NodeResultsSkeleton,
  NodeTrendSkeleton,
} from './nodes-skeleton'

describe('node regional skeletons', () => {
  it('exposes accessible busy labels for each independently streamed region', () => {
    const html = renderToStaticMarkup(
      <>
        <NodeHeaderActionsSkeleton />
        <NodeOverviewSkeleton />
        <NodeTrendSkeleton />
        <NodeResultsSkeleton view="components" />
      </>,
    )
    expect(html).toContain('Loading node page actions')
    expect(html).toContain('Loading node overview')
    expect(html).toContain('Loading node trend')
    expect(html).toContain('Loading component results')
    expect((html.match(/<th /g) ?? []).length).toBe(5)
  })
})

describe('Nodes streaming shell', () => {
  it('starts shared data promises in a synchronous shell with independent boundaries', () => {
    const shellSource = readFileSync(
      path.join(process.cwd(), 'src/components/nodes/nodes-shell.tsx'),
      'utf8',
    )

    // Results have an inner, view-specific fallback once host resolution finishes.
    expect(shellSource.match(/<Suspense/g)).toHaveLength(5)
    expect(shellSource).toContain('export function NodesShell')
    expect(shellSource).not.toContain('export async function NodesShell')
    expect(shellSource).toContain('const pagePromise')
    expect(shellSource).toContain('const overviewPromise')
    expect(shellSource).toContain('const trendPromise')
    expect(shellSource).toContain('const resultsPromise')
    expect(shellSource.match(/getNodeResults\(/g)).toHaveLength(1)
    expect(shellSource).toContain('<NodeHeaderActionsSkeleton')
    expect(shellSource).toContain('<NodeOverviewSkeleton')
    expect(shellSource).toContain('<NodeTrendSkeleton')
    expect(shellSource).toContain('<NodeResultsSkeleton')

    const mainSource = shellSource.slice(
      shellSource.indexOf('<main'),
      shellSource.indexOf('</main>'),
    )
    // Sibling boundaries allow static content and other regions to stream independently.
    expect(mainSource.match(/<Suspense /g)).toHaveLength(3)
    expect(mainSource.match(/<\/Suspense>/g)).toHaveLength(3)
  })

  it('consumes server-created promises in focused client regions', () => {
    for (const component of [
      'node-header-actions.tsx',
      'node-overview.tsx',
      'node-trend.tsx',
      'node-results.tsx',
    ]) {
      const source = readFileSync(
        path.join(process.cwd(), 'src/components/nodes', component),
        'utf8',
      )
      expect(source).toContain("'use client'")
      expect(source).toContain('use(dataPromise)')
    }
  })

  it('uses serializable node payload states across the server-client boundary', () => {
    const querySource = readFileSync(path.join(process.cwd(), 'src/lib/nodes/query.ts'), 'utf8')

    expect(querySource).toContain('export type NodeLoadState<T>')
    expect(querySource).toContain('export type NodeOverviewPayload')
    expect(querySource).toContain('export type NodeTrendPayload')
    expect(querySource).toContain('export type NodeResultsPayload')
  })

  it('routes directly to the shell and removes superseded wrappers', () => {
    const pageSource = readFileSync(
      path.join(process.cwd(), 'src/app/(app)/nodes/page.tsx'),
      'utf8',
    )

    expect(pageSource).toContain("from '@/components/nodes/nodes-shell'")
    expect(pageSource).toContain('<NodesShell')
    expect(existsSync(path.join(process.cwd(), 'src/components/nodes/nodes-view.tsx'))).toBe(false)
    expect(existsSync(path.join(process.cwd(), 'src/components/nodes/nodes-client.tsx'))).toBe(
      false,
    )
  })
})
