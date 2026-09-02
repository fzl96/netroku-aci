import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  DashboardAttentionSkeleton,
  DashboardHeaderSkeleton,
  DashboardInventorySkeleton,
  DashboardMetricsSkeleton,
  DashboardPostureSkeleton,
} from './dashboard-skeleton'

describe('dashboard regional skeletons', () => {
  it('renders shape-matched busy regions with accessible labels', () => {
    const html = renderToStaticMarkup(<>
      <DashboardHeaderSkeleton />
      <DashboardPostureSkeleton />
      <DashboardMetricsSkeleton />
      <DashboardAttentionSkeleton />
      <DashboardInventorySkeleton />
    </>)

    expect(html.match(/aria-busy="true"/g)).toHaveLength(5)
    expect(html).toContain('Loading dashboard status')
    expect(html).toContain('Loading global posture')
    expect(html).toContain('Loading dashboard metrics')
    expect(html).toContain('Loading attention items')
    expect(html).toContain('Loading APIC host coverage')
    expect(html).toContain('<table')
  })

  it('composes five independent regions from four shared dataset promises', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/components/dashboard/dashboard-view.tsx'),
      'utf8',
    )

    expect(source).toContain('export function DashboardView')
    expect(source).not.toContain('export async function DashboardView')
    expect(source.match(/<Suspense/g)).toHaveLength(5)
    expect(source.match(/getDashboardHosts\(\)/g)).toHaveLength(1)
    expect(source.match(/getDashboardEndpoints\(\)/g)).toHaveLength(1)
    expect(source.match(/getDashboardInterfaces\(\)/g)).toHaveLength(1)
    expect(source.match(/getDashboardNodes\(\)/g)).toHaveLength(1)
  })
})
