import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('devices streaming shell', () => {
  it('starts a shell-owned results promise in a synchronous shell with one boundary', () => {
    const shellSource = read('src/components/inventory/devices/devices-shell.tsx')

    expect(shellSource).toContain('export function DevicesShell')
    expect(shellSource).not.toContain('export async function DevicesShell')
    expect(shellSource.match(/<Suspense/g)).toHaveLength(1)

    expect(shellSource).toContain('const resultsPromise')
    expect(shellSource.match(/getDevices\(/g)).toHaveLength(1)
    expect(shellSource.match(/getDeviceStacks\(/g)).toHaveLength(1)
    expect(shellSource.match(/getInventoryViewerRole\(/g)).toHaveLength(1)

    expect(shellSource).toContain('<DevicesResultsSkeleton')
    expect(shellSource).toContain('<DevicesResults')

    expect(shellSource).toContain('Devices')
    expect(shellSource).toContain('Physical device inventory')
  })

  it('maps InventoryReadError to a serializable load state', () => {
    const shellSource = read('src/components/inventory/devices/devices-shell.tsx')
    expect(shellSource).toContain('InventoryReadError')
    expect(shellSource).toContain("kind: 'unauthorized'")
    expect(shellSource).toContain("kind: 'ready'")
  })

  it('uses a serializable devices load state across the server-client boundary', () => {
    const querySource = read('src/lib/inventory/devices/query.ts')
    expect(querySource).toContain('export type DevicesLoadState<T>')
    expect(querySource).toContain('export type DevicesResultsPayload')
  })

  it('starts role, paged devices, and stacks concurrently', () => {
    const shellSource = read('src/components/inventory/devices/devices-shell.tsx')
    expect(shellSource).toContain('Promise.all')
  })

  it('consumes the server-created promise in the mutation-capable results region', () => {
    const resultsSource = read('src/components/inventory/devices/devices-results.tsx')
    expect(resultsSource).toContain("'use client'")
    expect(resultsSource).toContain('use(dataPromise)')
  })

  it('preserves mutation, dialog, and pagination behavior in the results region', () => {
    const resultsSource = read('src/components/inventory/devices/devices-results.tsx')
    expect(resultsSource).toContain('DevicesRegionError')
    expect(resultsSource).toContain('createDevice')
    expect(resultsSource).toContain('updateDevice')
    expect(resultsSource).toContain('deleteDevice')
    expect(resultsSource).toContain('buildDeviceListUrl')
    expect(resultsSource).toContain('buildDeviceSearchUrl')
    expect(resultsSource).toContain('existingStacks')
    expect(resultsSource).not.toContain('devices-table-client')
  })

  it('routes directly to the shell and removes superseded fetch-and-forward wrappers', () => {
    const pageSource = read('src/app/(app)/inventory/devices/page.tsx')
    expect(pageSource).toContain("from '@/components/inventory/devices/devices-shell'")
    expect(pageSource).toContain('<DevicesShell')

    expect(
      existsSync(path.join(process.cwd(), 'src/components/inventory/devices/devices-view.tsx')),
    ).toBe(false)
    expect(
      existsSync(
        path.join(process.cwd(), 'src/components/inventory/devices/devices-table-client.tsx'),
      ),
    ).toBe(false)
  })
})
