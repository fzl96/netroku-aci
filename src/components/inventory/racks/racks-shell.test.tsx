import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('racks streaming shell', () => {
  it('starts shell-owned base and results promises in a synchronous shell with one boundary', () => {
    const shellSource = read('src/components/inventory/racks/racks-shell.tsx')

    expect(shellSource).toContain('export function RacksShell')
    expect(shellSource).not.toContain('export async function RacksShell')
    expect(shellSource.match(/<Suspense/g)).toHaveLength(1)

    expect(shellSource).toContain('const basePromise')
    expect(shellSource).toContain('const resultsPromise')
    expect(shellSource.match(/getSites\(/g)).toHaveLength(1)
    expect(shellSource.match(/getAllDevices\(/g)).toHaveLength(1)
    expect(shellSource.match(/getRacksBySite\(/g)).toHaveLength(1)
    expect(shellSource.match(/getInventoryViewerRole\(/g)).toHaveLength(1)

    expect(shellSource).toContain('<RacksResultsSkeleton')
    expect(shellSource).toContain('<RacksResults')
    expect(shellSource).toContain('Racks')
  })

  it('selects the requested or default site only after sites resolve', () => {
    const shellSource = read('src/components/inventory/racks/racks-shell.tsx')
    expect(shellSource).toContain('selectedSiteId')
    expect(shellSource).toContain('siteIdParam')
  })

  it('maps InventoryReadError to a serializable load state', () => {
    const shellSource = read('src/components/inventory/racks/racks-shell.tsx')
    expect(shellSource).toContain('export type RacksLoadState<T>')
    expect(shellSource).toContain('InventoryReadError')
    expect(shellSource).toContain("kind: 'unauthorized'")
    expect(shellSource).toContain("kind: 'ready'")
  })

  it('consumes one server-created promise in the mutation-capable results region', () => {
    const resultsSource = read('src/components/inventory/racks/racks-results.tsx')
    expect(resultsSource).toContain("'use client'")
    expect(resultsSource).toContain('use(dataPromise)')
  })

  it('preserves optimistic rack/device edits, drag-and-drop, site selection, and permissions', () => {
    const resultsSource = read('src/components/inventory/racks/racks-results.tsx')
    expect(resultsSource).toContain('RacksRegionError')
    expect(resultsSource).toContain('createSite')
    expect(resultsSource).toContain('updateSite')
    expect(resultsSource).toContain('deleteSite')
    expect(resultsSource).toContain('createRack')
    expect(resultsSource).toContain('updateRack')
    expect(resultsSource).toContain('deleteRack')
    expect(resultsSource).toContain('updateDevicePlacement')
    expect(resultsSource).toContain('clearDevicePlacement')
    expect(resultsSource).toContain('updateDeviceHeight')
    expect(resultsSource).toContain('canPlaceDevice')
    expect(resultsSource).toContain('DragPayload')
    expect(resultsSource).toContain('isAdmin')
    expect(resultsSource).not.toContain('racks-table-client')
  })

  it('routes directly to the shell and removes superseded fetch-and-forward wrappers', () => {
    const pageSource = read('src/app/(app)/inventory/racks/page.tsx')
    expect(pageSource).toContain("from '@/components/inventory/racks/racks-shell'")
    expect(pageSource).toContain('<RacksShell')

    expect(
      existsSync(path.join(process.cwd(), 'src/components/inventory/racks/racks-view.tsx')),
    ).toBe(false)
    expect(
      existsSync(
        path.join(process.cwd(), 'src/components/inventory/racks/racks-table-client.tsx'),
      ),
    ).toBe(false)
  })
})
