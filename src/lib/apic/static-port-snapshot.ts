import { apicFetch } from './client'
import type { ApicFetcher } from './read-cache'

const SNAPSHOT_PAGE_SIZE = 5_000
const EPG_PATH = '/api/node/class/fvAEPg.json?rsp-subtree=children&rsp-subtree-class=fvRsPathAtt'
const NODE_PATH = '/api/node/class/fabricNode.json'
const BUNDLE_PATH = '/api/node/class/infraAccBndlGrp.json'
const PHYSICAL_PATH = '/api/node/class/fabricPathEp.json'

export type SnapshotRead<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string }

export interface EpgBindingIndex {
  epgDns: Set<string>
  bindingsByDn: Map<string, { tDn: string; encap: string }>
  bindingDnsByPathAndEncap: Map<string, string[]>
}

export interface StaticPortSnapshot {
  epgBindings: SnapshotRead<EpgBindingIndex>
  nodes: SnapshotRead<Set<number>>
  bundles: SnapshotRead<Set<string>>
  physicalPaths: SnapshotRead<Set<string>>
}

export interface StaticPortSnapshotRequirements {
  nodes: boolean
  bundles: boolean
  physicalPaths: boolean
}

export type StaticPortSnapshotLoader = (
  host: string,
  token: string,
  requirements: StaticPortSnapshotRequirements,
) => Promise<StaticPortSnapshot>

interface PageEnvelope<T> {
  imdata?: T[]
  totalCount?: string | number
}

interface MoAttributes {
  [name: string]: string | undefined
}

interface BindingMo {
  fvRsPathAtt?: { attributes: MoAttributes }
}

interface EpgMo {
  fvAEPg?: {
    attributes: MoAttributes
    children?: BindingMo[]
  }
}

interface NodeMo {
  fabricNode?: { attributes: MoAttributes }
}

interface BundleMo {
  infraAccBndlGrp?: { attributes: MoAttributes }
}

interface PhysicalPathMo {
  fabricPathEp?: { attributes: MoAttributes }
}

export function bindingLookupKey(tDn: string, encap: string): string {
  return JSON.stringify([tDn, encap])
}

function pagePath(basePath: string, page: number): string {
  const separator = basePath.includes('?') ? '&' : '?'
  return `${basePath}${separator}page=${page}&page-size=${SNAPSHOT_PAGE_SIZE}`
}

function parseTotalCount(value: string | number | undefined): number | null {
  if (value === undefined || (typeof value === 'string' && value.trim() === '')) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

async function readPage<T>(
  host: string,
  token: string,
  path: string,
  fetcher: ApicFetcher,
): Promise<SnapshotRead<PageEnvelope<T>>> {
  try {
    const response = await fetcher(host, path, { token })
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: (await response.text()).slice(0, 200),
      }
    }
    return { ok: true, value: await response.json() as PageEnvelope<T> }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

async function loadPagedIndex<TMo, TIndex>(
  host: string,
  token: string,
  basePath: string,
  createIndex: () => TIndex,
  addPage: (index: TIndex, imdata: TMo[]) => void,
  fetcher: ApicFetcher,
): Promise<SnapshotRead<TIndex>> {
  const index = createIndex()
  const first = await readPage<TMo>(host, token, pagePath(basePath, 0), fetcher)
  if (!first.ok) return first

  addPage(index, first.value.imdata ?? [])
  const totalCount = parseTotalCount(first.value.totalCount)
  const pageCount = totalCount === null
    ? 1
    : Math.max(1, Math.ceil(totalCount / SNAPSHOT_PAGE_SIZE))

  for (let page = 1; page < pageCount; page += 1) {
    const result = await readPage<TMo>(host, token, pagePath(basePath, page), fetcher)
    if (!result.ok) return result
    addPage(index, result.value.imdata ?? [])
  }

  return { ok: true, value: index }
}

function emptyEpgBindingIndex(): EpgBindingIndex {
  return {
    epgDns: new Set(),
    bindingsByDn: new Map(),
    bindingDnsByPathAndEncap: new Map(),
  }
}

function addEpgPage(index: EpgBindingIndex, imdata: EpgMo[]): void {
  for (const item of imdata) {
    const epg = item.fvAEPg
    const epgDn = epg?.attributes.dn
    if (!epg || !epgDn) continue
    index.epgDns.add(epgDn)

    for (const child of epg.children ?? []) {
      const attributes = child.fvRsPathAtt?.attributes
      const tDn = attributes?.tDn
      const encap = attributes?.encap
      if (!tDn || !encap) continue
      const dn = attributes?.dn || `${epgDn}/rspathAtt-[${tDn}]`

      index.bindingsByDn.set(dn, { tDn, encap })
      const key = bindingLookupKey(tDn, encap)
      const dns = index.bindingDnsByPathAndEncap.get(key)
      if (dns) dns.push(dn)
      else index.bindingDnsByPathAndEncap.set(key, [dn])
    }
  }
}

function addNodePage(index: Set<number>, imdata: NodeMo[]): void {
  for (const item of imdata) {
    const attributes = item.fabricNode?.attributes
    if (!attributes) continue
    const podOneNodeId = attributes.dn?.match(/^topology\/pod-1\/node-(\d+)$/)?.[1]
    const nodeId = Number(podOneNodeId)
    if (Number.isSafeInteger(nodeId)) index.add(nodeId)
  }
}

function addBundlePage(index: Set<string>, imdata: BundleMo[]): void {
  for (const item of imdata) {
    const attributes = item.infraAccBndlGrp?.attributes
    if (!attributes) continue
    const fromDn = attributes.dn?.match(/\/accbundle-(.+)$/)?.[1]
    const name = attributes.name ?? fromDn
    if (name) index.add(name)
  }
}

function addPhysicalPathPage(index: Set<string>, imdata: PhysicalPathMo[]): void {
  for (const item of imdata) {
    const dn = item.fabricPathEp?.attributes.dn
    if (dn) index.add(dn)
  }
}

function skippedSet<T>(): SnapshotRead<Set<T>> {
  return { ok: true, value: new Set<T>() }
}

export async function loadStaticPortSnapshot(
  host: string,
  token: string,
  requirements: StaticPortSnapshotRequirements,
  fetcher: ApicFetcher = apicFetch,
): Promise<StaticPortSnapshot> {
  const [epgBindings, nodes, bundles, physicalPaths] = await Promise.all([
    loadPagedIndex(host, token, EPG_PATH, emptyEpgBindingIndex, addEpgPage, fetcher),
    requirements.nodes
      ? loadPagedIndex(host, token, NODE_PATH, () => new Set<number>(), addNodePage, fetcher)
      : Promise.resolve(skippedSet<number>()),
    requirements.bundles
      ? loadPagedIndex(host, token, BUNDLE_PATH, () => new Set<string>(), addBundlePage, fetcher)
      : Promise.resolve(skippedSet<string>()),
    requirements.physicalPaths
      ? loadPagedIndex(host, token, PHYSICAL_PATH, () => new Set<string>(), addPhysicalPathPage, fetcher)
      : Promise.resolve(skippedSet<string>()),
  ])

  return { epgBindings, nodes, bundles, physicalPaths }
}
