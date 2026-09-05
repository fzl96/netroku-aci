import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

function absolutePath(relativePath: string) {
  return path.join(process.cwd(), relativePath)
}

/**
 * Table-driven spec for the legacy summary/filter/results shell shape.
 *
 * Every legacy list route (devices, endpoints, health, and — once task 11
 * lands — interfaces) shares one architecture: a synchronous shell starts
 * three independent promises (summary, filters, results) and renders them
 * behind three independent `<Suspense>` boundaries. Summary stays a Server
 * Component that awaits its promise directly; filters and results become
 * Client Components that consume their promise with `use()`. Adding a new
 * route to this suite is just adding one entry to `ROUTES` below plus a
 * `behaviors` list for whatever interactive behavior that route's results
 * region must preserve (drawer, mac formatting, etc).
 */
type RouteSpec = {
  name: string
  dir: string
  shellFile: string
  shellExport: string
  summaryFile: string
  summaryExport: string
  filtersFile: string
  filtersExport: string
  resultsFile: string
  resultsExport: string
  regionErrorExport: string
  querySource: string
  loadStateType: string
  filtersPayloadType: string
  readErrorType: string
  summaryFetcher: string
  filtersFetcher: string
  resultsFetcher: string
  pagePath: string
  viewFile: string
  clientFile: string
  /** Substrings that must survive in the merged results region source,
   *  proving route-specific interactive behavior wasn't lost in the merge. */
  resultsBehaviors: string[]
  /** Substrings that must NOT appear in the merged results region source. */
  resultsForbidden?: string[]
}

const ROUTES: RouteSpec[] = [
  {
    name: 'devices',
    dir: 'src/components/legacy/devices',
    shellFile: 'devices-shell.tsx',
    shellExport: 'LegacyDevicesShell',
    summaryFile: 'device-summary.tsx',
    summaryExport: 'LegacyDeviceSummary',
    filtersFile: 'device-filters.tsx',
    filtersExport: 'LegacyDeviceFilters',
    resultsFile: 'device-results.tsx',
    resultsExport: 'LegacyDeviceResults',
    regionErrorExport: 'LegacyDeviceRegionError',
    querySource: 'src/lib/legacy/devices/query.ts',
    loadStateType: 'LegacyDeviceLoadState',
    filtersPayloadType: 'LegacyDeviceFiltersPayload',
    readErrorType: 'LegacyDeviceReadError',
    summaryFetcher: 'getLegacyDeviceSummary',
    filtersFetcher: 'getLegacyDeviceFilterOptions',
    resultsFetcher: 'getLegacyDeviceResults',
    pagePath: 'src/app/(app)/legacy/devices/page.tsx',
    viewFile: 'devices-view.tsx',
    clientFile: 'devices-client.tsx',
    resultsBehaviors: [
      'LegacyDeviceDrawer',
      'setSelected',
      'LegacyEmptyState',
      'LegacyPagination',
      'DataCard',
    ],
  },
  {
    name: 'endpoints',
    dir: 'src/components/legacy/endpoints',
    shellFile: 'endpoints-shell.tsx',
    shellExport: 'LegacyEndpointsShell',
    summaryFile: 'endpoint-summary.tsx',
    summaryExport: 'LegacyEndpointSummary',
    filtersFile: 'endpoint-filters.tsx',
    filtersExport: 'LegacyEndpointFilters',
    resultsFile: 'endpoint-results.tsx',
    resultsExport: 'LegacyEndpointResults',
    regionErrorExport: 'LegacyEndpointRegionError',
    querySource: 'src/lib/legacy/endpoints/query.ts',
    loadStateType: 'LegacyEndpointLoadState',
    filtersPayloadType: 'LegacyEndpointFiltersPayload',
    readErrorType: 'LegacyEndpointReadError',
    summaryFetcher: 'getLegacyEndpointSummary',
    filtersFetcher: 'getLegacyEndpointFilterOptions',
    resultsFetcher: 'getLegacyEndpointResults',
    pagePath: 'src/app/(app)/legacy/endpoints/page.tsx',
    viewFile: 'endpoints-view.tsx',
    clientFile: 'endpoints-client.tsx',
    resultsBehaviors: [
      'export function LegacyMac',
      'LegacyEmptyState',
      'LegacyPagination',
      'DataCard',
    ],
  },
  {
    name: 'health',
    dir: 'src/components/legacy/health',
    shellFile: 'health-shell.tsx',
    shellExport: 'LegacyHealthShell',
    summaryFile: 'health-summary.tsx',
    summaryExport: 'LegacyHealthSummary',
    filtersFile: 'health-filters.tsx',
    filtersExport: 'LegacyHealthFilters',
    resultsFile: 'health-results.tsx',
    resultsExport: 'LegacyHealthResults',
    regionErrorExport: 'LegacyHealthRegionError',
    querySource: 'src/lib/legacy/health/query.ts',
    loadStateType: 'LegacyHealthLoadState',
    filtersPayloadType: 'LegacyHealthFiltersPayload',
    readErrorType: 'LegacyHealthReadError',
    summaryFetcher: 'getLegacyHealthSummary',
    filtersFetcher: 'getLegacyHealthFilterOptions',
    resultsFetcher: 'getLegacyHealthResults',
    pagePath: 'src/app/(app)/legacy/health/page.tsx',
    viewFile: 'health-view.tsx',
    clientFile: 'health-client.tsx',
    resultsBehaviors: [
      'LegacyHealthDrawer',
      'setSelected',
      'legacyStatusText',
      'LegacyEmptyState',
      'LegacyPagination',
      'DataCard',
    ],
  },
  {
    name: 'interfaces',
    dir: 'src/components/legacy/interfaces',
    shellFile: 'interfaces-shell.tsx',
    shellExport: 'LegacyInterfacesShell',
    summaryFile: 'interface-summary.tsx',
    summaryExport: 'LegacyInterfaceSummary',
    filtersFile: 'interface-filters.tsx',
    filtersExport: 'LegacyInterfaceFilters',
    resultsFile: 'interface-results.tsx',
    resultsExport: 'LegacyInterfaceResults',
    regionErrorExport: 'LegacyInterfaceRegionError',
    querySource: 'src/lib/legacy/interfaces/query.ts',
    loadStateType: 'LegacyInterfaceLoadState',
    filtersPayloadType: 'LegacyInterfaceFiltersPayload',
    readErrorType: 'LegacyInterfaceReadError',
    summaryFetcher: 'getLegacyInterfaceSummary',
    filtersFetcher: 'getLegacyInterfaceFilterOptions',
    resultsFetcher: 'getLegacyInterfaceResults',
    pagePath: 'src/app/(app)/legacy/interfaces/page.tsx',
    viewFile: 'interfaces-view.tsx',
    clientFile: 'interfaces-client.tsx',
    resultsBehaviors: [
      'LegacyInterfaceDrawer',
      'setSelected',
      'handleSort',
      'LegacyEmptyState',
      'LegacyPagination',
      'DataCard',
    ],
    resultsForbidden: [
      'LegacyInterfacesFrame',
      'NavigationContext',
      'useLegacyInterfaceNavigation',
    ],
  },
]

for (const route of ROUTES) {
  describe(`${route.name} legacy shell`, () => {
    it('starts three shell-owned promises in a synchronous shell with three independent boundaries', () => {
      const shellSource = read(path.join(route.dir, route.shellFile))

      expect(shellSource).toContain(`export function ${route.shellExport}`)
      expect(shellSource).not.toContain(`export async function ${route.shellExport}`)
      expect(shellSource.match(/<Suspense/g)).toHaveLength(3)

      expect(shellSource).toContain('const summaryPromise')
      expect(shellSource).toContain('const filtersPromise')
      expect(shellSource).toContain('const resultsPromise')
      expect(shellSource.match(new RegExp(`${route.summaryFetcher}\\(`, 'g'))).toHaveLength(1)
      expect(shellSource.match(new RegExp(`${route.filtersFetcher}\\(`, 'g'))).toHaveLength(1)
      expect(shellSource.match(new RegExp(`${route.resultsFetcher}\\(`, 'g'))).toHaveLength(1)

      expect(shellSource).toContain(`<${route.summaryExport}Skeleton`)
      expect(shellSource).toContain(`<${route.filtersExport}Skeleton`)
      expect(shellSource).toContain(`<${route.resultsExport}Skeleton`)
      expect(shellSource).toContain(`<${route.summaryExport} summaryPromise={summaryPromise}`)
      expect(shellSource).toContain(`<${route.filtersExport} dataPromise={filtersPromise}`)
      expect(shellSource).toContain(`<${route.resultsExport} dataPromise={resultsPromise}`)

      expect(shellSource).toContain('LegacyPageShell')
    })

    it('maps read errors to a serializable load state for the filters and results loaders', () => {
      const shellSource = read(path.join(route.dir, route.shellFile))
      expect(shellSource).toContain(route.readErrorType)
      expect(shellSource).toContain("kind: 'unauthorized'")
      expect(shellSource).toContain("kind: 'ready'")
    })

    it('declares a serializable load state and filters payload in the query module', () => {
      const querySource = read(route.querySource)
      expect(querySource).toContain(`export type ${route.loadStateType}<T>`)
      expect(querySource).toContain(`export type ${route.filtersPayloadType}`)
    })

    it('keeps summary as a Server Component that awaits its promise directly', () => {
      const summarySource = read(path.join(route.dir, route.summaryFile))
      expect(summarySource).not.toContain("'use client'")
      expect(summarySource).toContain(`export async function ${route.summaryExport}`)
      expect(summarySource).toContain('await summaryPromise')
      expect(summarySource).not.toContain('use(')
      expect(summarySource).toContain(route.regionErrorExport)
    })

    it('consumes shell-provided promises via use() in the filters and results client regions', () => {
      for (const file of [route.filtersFile, route.resultsFile]) {
        const source = read(path.join(route.dir, file))
        expect(source).toContain("'use client'")
        expect(source).toContain('use(dataPromise)')
        expect(source).toContain(route.regionErrorExport)
      }
    })

    it('preserves route-specific interactive behavior in the results region', () => {
      const resultsSource = read(path.join(route.dir, route.resultsFile))
      for (const behavior of route.resultsBehaviors) {
        expect(resultsSource).toContain(behavior)
      }
      for (const forbidden of route.resultsForbidden ?? []) {
        expect(resultsSource).not.toContain(forbidden)
      }
    })

    it('routes directly to the shell and removes the superseded view/client aggregates', () => {
      const pageSource = read(route.pagePath)
      const shellSpecifier = `@/${route.dir.replace(/^src\//, '')}/${route.shellFile.replace(/\.tsx$/, '')}`
      expect(pageSource).toContain(`from '${shellSpecifier}'`)
      expect(pageSource).toContain(`<${route.shellExport}`)

      expect(existsSync(absolutePath(path.join(route.dir, route.viewFile)))).toBe(false)
      expect(existsSync(absolutePath(path.join(route.dir, route.clientFile)))).toBe(false)
    })
  })
}

describe('legacy shell shared modules', () => {
  it('keeps LegacyPageShell and LegacyPagination as reused deep modules, not per-route adapters', () => {
    expect(existsSync(absolutePath('src/components/legacy/legacy-page-shell.tsx'))).toBe(true)
    expect(existsSync(absolutePath('src/components/legacy/legacy-pagination.tsx'))).toBe(true)

    for (const route of ROUTES) {
      const resultsSource = read(path.join(route.dir, route.resultsFile))
      expect(resultsSource).toContain('LegacyPagination')
    }
  })
})
