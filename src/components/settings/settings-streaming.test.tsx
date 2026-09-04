import { expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'

it('renders the Settings shell before its session-gated region', () => {
  const shell = readFileSync('src/components/settings/settings-shell.tsx', 'utf8')
  const skeleton = readFileSync('src/components/settings/settings-skeleton.tsx', 'utf8')

  expect(shell).toContain('export function SettingsShell')
  expect(shell).toContain('<h1')
  expect(shell).toContain('<Suspense')
  expect(shell).toContain('async function SettingsContent')
  expect(skeleton).toContain('aria-busy="true"')
  expect(skeleton).toContain('Loading account settings')
})

it('preserves the session redirect gate in SettingsContent', () => {
  const shell = readFileSync('src/components/settings/settings-shell.tsx', 'utf8')

  expect(shell).toContain('getSession()')
  expect(shell).toContain("redirect('/signin')")
})
