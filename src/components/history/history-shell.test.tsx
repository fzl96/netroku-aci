import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('history streaming shell', () => {
  it('starts a shell-owned results promise in a synchronous shell with independent boundaries', () => {
    const shellSource = read('src/components/history/history-shell.tsx')

    expect(shellSource).toContain('export function HistoryShell')
    expect(shellSource).not.toContain('export async function HistoryShell')
    expect(shellSource.match(/<Suspense/g)).toHaveLength(2)

    expect(shellSource).toContain('const resultsPromise')
    expect(shellSource.match(/getHistoryPage\(/g)).toHaveLength(1)

    expect(shellSource).toContain('<HistoryControlsSkeleton')
    expect(shellSource).toContain('<HistoryResultsSkeleton')
    expect(shellSource).toContain('<HistoryControls')
    expect(shellSource).toContain('<HistoryResults')

    expect(shellSource).toContain('History')
    expect(shellSource).toContain('Activity log of actions across Netroku ACI')
  })

  it('consumes server-created promises in focused client regions', () => {
    const controlsSource = read('src/components/history/history-controls.tsx')
    expect(controlsSource).toContain("'use client'")
    expect(controlsSource).toContain('use(paramsPromise)')

    const resultsSource = read('src/components/history/history-results.tsx')
    expect(resultsSource).toContain("'use client'")
    expect(resultsSource).toContain('use(dataPromise)')
  })

  it('preserves expected-error UI, URL replacement, and pagination in the results region', () => {
    const resultsSource = read('src/components/history/history-results.tsx')
    expect(resultsSource).toContain('HistoryRegionError')
    expect(resultsSource).toContain('router.replace')
    expect(resultsSource).toContain('buildHistoryUrl')
    expect(resultsSource).toContain('totalPages')
  })

  it('uses a serializable history load state across the server-client boundary', () => {
    const querySource = read('src/lib/history/query.ts')
    expect(querySource).toContain('export type HistoryLoadState<T>')
    expect(querySource).toContain('export type HistoryResultsPayload')
  })

  it('routes directly to the shell and removes superseded forwarding wrappers', () => {
    const pageSource = read('src/app/(app)/history/page.tsx')
    expect(pageSource).toContain("from '@/components/history/history-shell'")
    expect(pageSource).toContain('<HistoryShell')

    expect(existsSync(path.join(process.cwd(), 'src/components/history/history-view.tsx'))).toBe(
      false,
    )
    expect(
      existsSync(path.join(process.cwd(), 'src/components/history/history-controls-client.tsx')),
    ).toBe(false)
    expect(
      existsSync(path.join(process.cwd(), 'src/components/history/history-results-client.tsx')),
    ).toBe(false)
  })
})
