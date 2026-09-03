import { expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'

it('renders the device-import shell before its role-gated region', () => {
  const view = readFileSync('src/components/inventory/devices/device-import-view.tsx', 'utf8')
  const skeleton = readFileSync('src/components/inventory/devices/devices-skeleton.tsx', 'utf8')

  expect(view).toContain('export function DeviceImportView')
  expect(view).toContain('Import Devices from CSV')
  expect(view).toContain('<Suspense')
  expect(view).toContain('async function DeviceImportContent')
  expect(skeleton).toContain('aria-label="Loading device import"')
})
