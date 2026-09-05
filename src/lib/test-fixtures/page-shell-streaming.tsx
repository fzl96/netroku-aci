// Run in a subprocess so these client/query stand-ins cannot replace modules
// used by the query-data suites in Bun's shared module registry.
import assert from 'node:assert/strict'
import path from 'node:path'
import { mock } from 'bun:test'
import { createElement, use, type ComponentType } from 'react'
import { renderToReadableStream } from 'react-dom/server'

type State = { kind: string; data?: { filteredTotal?: number } }
type RegionProps = { dataPromise?: Promise<State>; paramsPromise?: Promise<unknown> }
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const domains = {
  endpoints: {
    title: 'Endpoints',
    shell: 'EndpointsShell',
    file: 'endpoints-shell',
    error: 'EndpointReadError',
    host: 'resolveEndpointHost',
    overview: 'getEndpointOverview',
    results: 'getEndpointResults',
    regions: {
      'endpoint-header-actions': 'EndpointHeaderActions',
      'endpoint-overview': 'EndpointOverview',
      'endpoint-results': 'EndpointResults',
    },
    overviewRegion: 'EndpointOverview',
    resultsRegion: 'EndpointResults',
    loading: 'Loading endpoint filters and totals',
    view: 'port',
    viewLoading: 'Loading port results',
  },
  nodes: {
    title: 'Nodes',
    shell: 'NodesShell',
    file: 'nodes-shell',
    error: 'NodeReadError',
    host: 'resolveNodeHost',
    overview: 'getNodeOverview',
    results: 'getNodeResults',
    regions: {
      'node-header-actions': 'NodeHeaderActions',
      'node-overview': 'NodeOverview',
      'node-results': 'NodeResults',
      'node-trend': 'NodeTrend',
    },
    overviewRegion: 'NodeOverview',
    resultsRegion: 'NodeResults',
    loading: 'Loading node overview',
    view: 'components',
    viewLoading: 'Loading component results',
  },
  'interface-health': {
    title: 'Interfaces',
    shell: 'InterfaceHealthShell',
    file: 'interface-health-shell',
    error: 'InterfaceReadError',
    host: 'resolveInterfaceHost',
    overview: 'getInterfaceOverview',
    results: 'getInterfaceResults',
    regions: {
      'interface-header-actions': 'InterfaceHeaderActions',
      'interface-controls': 'InterfaceControls',
      'interface-node-filter': 'InterfaceNodeFilter',
      'interface-summary': 'InterfaceSummary',
      'interface-crc-trend': 'InterfaceCrcTrend',
      'interface-sync-status': 'InterfaceSyncStatus',
      'interface-results': 'InterfaceResults',
    },
    overviewRegion: 'InterfaceSyncStatus',
    resultsRegion: 'InterfaceResults',
    loading: 'Loading interface filters',
    view: 'crc',
    viewLoading: 'Loading CRC trend',
  },
} as const
const domain = process.argv[2] as keyof typeof domains
const scenario = process.argv[3]
const config = domains[domain]
const host = deferred<unknown>()
const overview = deferred<unknown>()
const results = deferred<unknown>()
const crc = deferred<unknown>()
const params = deferred<unknown>()
class ReadError extends Error {}
const calls = { host: 0, overview: 0, results: 0, crc: 0 }
mock.module(path.resolve(`src/lib/${domain}/query.ts`), () => ({
  [config.error]: ReadError,
  [config.host]: () => {
    calls.host++
    return host.promise
  },
  [config.overview]: () => {
    calls.overview++
    return overview.promise
  },
  [config.results]: () => {
    calls.results++
    return results.promise
  },
  getNodeTrend: async () => [],
  getInterfaceCrcWindow: () => {
    calls.crc++
    return crc.promise
  },
}))
for (const [file, name] of Object.entries(config.regions)) {
  mock.module(path.resolve(`src/components/${domain}/${file}.tsx`), () => ({
    [name]: ({ dataPromise, paramsPromise }: RegionProps) => {
      const state = dataPromise ? use(dataPromise) : (use(paramsPromise!) as State)
      if (name === 'EndpointHeaderActions' && state.kind === 'ready') {
        assert.equal(state.data?.filteredTotal, 1, 'Header keeps the shared result total')
      }
      if (state.kind === 'inactive') return null
      return createElement('span', null, `${name}:${state.kind ?? 'ready'}`)
    },
  }))
}
mock.module(
  path.resolve(
    `src/components/${domain}/${domain === 'interface-health' ? 'interface' : domain === 'nodes' ? 'node' : 'endpoint'}-region-error.tsx`,
  ),
  () => ({
    [domain === 'interface-health'
      ? 'InterfaceRegionError'
      : domain === 'nodes'
        ? 'NodeRegionError'
        : 'EndpointRegionError']: () => createElement('span', null, 'host-error'),
  }),
)
const shellModule = await import(path.resolve(`src/components/${domain}/${config.file}.tsx`))
const Shell = shellModule[config.shell] as ComponentType<{ paramsPromise: Promise<unknown> }>
const controller = new AbortController()
const timeout = setTimeout(
  () => controller.abort(new Error('The static shell did not stream')),
  2000,
)
const errors: unknown[] = []
try {
  const stream = await renderToReadableStream(
    createElement(Shell, { paramsPromise: params.promise }),
    {
      signal: controller.signal,
      onError: (error) => {
        errors.push(error)
      },
    },
  )
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let html = ''
  async function readUntil(marker: string) {
    while (!html.includes(marker)) {
      const chunk = await reader.read()
      assert.equal(chunk.done, false, `Stream ended before ${marker}: ${html}`)
      html += decoder.decode(chunk.value)
    }
  }
  await readUntil(`>${config.title}</h1>`)
  assert.ok(html.includes(config.loading), 'Initial regional skeleton must paint with the heading')
  assert.equal(calls.host, 0, 'Shell must paint before even search params resolve')
  params.resolve({ hostId: 'h1', view: scenario === 'non-crc' ? 'all' : config.view })
  // Both params and host resolution remain independent of the initial shell.
  if (scenario === 'empty') {
    host.resolve({ kind: 'empty' })
    await readUntil('No APIC host selected')
  } else if (scenario === 'unauthorized') {
    host.reject(new ReadError('missing session'))
    await readUntil('host-error')
  } else if (scenario === 'redirect') {
    host.resolve({ kind: 'redirect', location: `/${domain}?apic=h1` })
  } else {
    host.resolve({ kind: 'selected', host: { id: 'h1' }, hosts: [{ id: 'h1' }] })
    await readUntil(scenario === 'non-crc' ? 'Loading interface results' : config.viewLoading)
    overview.resolve({ activeTotal: 1, historicalTotal: 0 })
    await readUntil(`${config.overviewRegion}:ready`)
    assert.ok(
      !html.includes(`${config.resultsRegion}:ready`),
      'Overview must stream while results are pending',
    )
    // CRC queries intentionally precede CRC table results and are shared once.
    crc.resolve({ trend: [] })
    if (scenario === 'results-error') results.reject(new ReadError('result read failed'))
    else results.resolve({ pagination: { total: 1 } })
    await readUntil(
      `${config.resultsRegion}:${scenario === 'results-error' ? 'unauthorized' : 'ready'}`,
    )
    assert.equal(calls.overview, 1)
    assert.equal(calls.results, 1)
    if (domain === 'interface-health') assert.equal(calls.crc, scenario === 'non-crc' ? 0 : 1)
  }
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    html += decoder.decode(chunk.value)
  }
  if (scenario === 'non-crc') assert.ok(!html.includes('Loading CRC trend'))
  assert.equal(calls.host, 1)
  if (scenario === 'redirect') {
    assert.ok(
      errors.some(
        (error) =>
          typeof error === 'object' &&
          error !== null &&
          'digest' in error &&
          String(error.digest).includes(`NEXT_REDIRECT;replace;/${domain}?apic=h1;`),
      ),
    )
  } else {
    assert.deepEqual(errors, [])
  }
  if (['empty', 'unauthorized', 'redirect'].includes(scenario)) {
    assert.equal(calls.overview, 0)
    assert.equal(calls.results, 0)
    assert.ok(!html.includes(`${config.resultsRegion}:ready`))
  }
} finally {
  clearTimeout(timeout)
  controller.abort()
}
