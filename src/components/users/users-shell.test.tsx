import { expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'

it('renders the Users shell before its authorization-gated region', () => {
  const shell = readFileSync('src/components/users/users-shell.tsx', 'utf8')

  expect(shell).toContain('export function UsersShell')
  expect(shell).toContain('<h1')
  expect(shell).toContain('Users')
  expect(shell).toContain('<Suspense')
  expect(shell).toContain('<UsersResults')
})

it('preserves authorization, redirect, and expected-error handling in UsersResults', () => {
  const results = readFileSync('src/components/users/users-results.tsx', 'utf8')

  expect(results).toContain('export async function UsersResults')
  expect(results).toContain('requireSession()')
  expect(results).toContain("redirect('/signin')")
  expect(results).toContain("notFound()")
  expect(results).toContain('UserReadError')
  expect(results).toContain('<UsersRegionError')
})
