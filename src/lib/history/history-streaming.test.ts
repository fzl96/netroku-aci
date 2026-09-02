import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()

describe('history streaming architecture', () => {
  it('has a synchronous purpose view with independent controls and results regions', () => {
    const viewPath = path.join(root, 'src/components/history/history-view.tsx')
    expect(existsSync(viewPath)).toBe(true)
    if (!existsSync(viewPath)) return

    const source = readFileSync(viewPath, 'utf8')
    expect(source).toContain('export function HistoryView')
    expect(source).not.toContain('export async function HistoryView')
    expect(source.match(/<Suspense/g)).toHaveLength(2)
    expect(source).toContain('<HistoryControls')
    expect(source).toContain('<HistoryResults')
  })

  it('keeps the route adapter synchronous and framework-only', () => {
    const page = readFileSync(path.join(root, 'src/app/(app)/history/page.tsx'), 'utf8')
    expect(page).toContain('export default function Page')
    expect(page).not.toContain('export default async function')
    expect(page).not.toContain('getSession')
    expect(page).not.toContain('@/lib/prisma')
  })

  it('provides accessible shape-matched fallbacks and a regional retry', () => {
    const skeletonPath = path.join(root, 'src/components/history/history-skeleton.tsx')
    const errorPath = path.join(root, 'src/components/history/history-region-error.tsx')
    expect(existsSync(skeletonPath)).toBe(true)
    expect(existsSync(errorPath)).toBe(true)
    if (!existsSync(skeletonPath) || !existsSync(errorPath)) return

    const skeleton = readFileSync(skeletonPath, 'utf8')
    const error = readFileSync(errorPath, 'utf8')
    expect(skeleton).toContain('Loading history filters')
    expect(skeleton).toContain('Loading history results')
    expect(skeleton).toContain('aria-busy="true"')
    expect(error).toContain('router.refresh()')
    expect(error).toContain('Retry')
  })
})
