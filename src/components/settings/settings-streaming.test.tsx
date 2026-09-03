import { expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'

it('renders the Settings shell before its session-gated region', () => {
  const view = readFileSync('src/components/settings/settings-view.tsx', 'utf8')
  const skeleton = readFileSync('src/components/settings/settings-skeleton.tsx', 'utf8')

  expect(view).toContain('export function SettingsView')
  expect(view).toContain('<h1')
  expect(view).toContain('<Suspense')
  expect(view).toContain('async function SettingsContent')
  expect(skeleton).toContain('aria-busy="true"')
  expect(skeleton).toContain('Loading account settings')
})
