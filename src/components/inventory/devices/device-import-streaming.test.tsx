import { expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'

it('renders the device-import shell before its role-gated region', () => {
  const shell = readFileSync('src/components/inventory/devices/device-import-shell.tsx', 'utf8')
  const skeleton = readFileSync('src/components/inventory/devices/devices-skeleton.tsx', 'utf8')

  expect(shell).toContain('export function DeviceImportShell')
  expect(shell).toContain('Import Devices from CSV')
  expect(shell).toContain('<Suspense')
  expect(shell).toContain('async function DeviceImportContent')
  expect(skeleton).toContain('aria-label="Loading device import"')
})

it('retains the role-based redirects around DeviceImportClient in the import shell', () => {
  const shell = readFileSync('src/components/inventory/devices/device-import-shell.tsx', 'utf8')

  expect(shell).toContain('getInventoryViewerRole')
  expect(shell).toContain("redirect('/signin')")
  expect(shell).toContain("redirect('/inventory/devices')")
  expect(shell).toContain('<DeviceImportClient')
})

it('retains the detail shell server-side read-error redirect and notFound behavior', () => {
  const shell = readFileSync('src/components/inventory/devices/device-detail-shell.tsx', 'utf8')

  expect(shell).toContain('export async function DeviceDetailShell')
  expect(shell).toContain('InventoryReadError')
  expect(shell).toContain("redirect('/signin')")
  expect(shell).toContain('notFound()')
  expect(shell).toContain('getDeviceById')
})
