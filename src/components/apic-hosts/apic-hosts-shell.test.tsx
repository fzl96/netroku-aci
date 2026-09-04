import { expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'

it('renders the ApicHosts shell before its authorization-gated region', () => {
  const shell = readFileSync('src/components/apic-hosts/apic-hosts-shell.tsx', 'utf8')

  expect(shell).toContain('export function ApicHostsShell')
  expect(shell).toContain('<h1')
  expect(shell).toContain('APIC Hosts')
  expect(shell).toContain('<Suspense')
  expect(shell).toContain('<ApicHostsResults')
})

it('preserves authorization, redirect, and expected-error handling in ApicHostsResults', () => {
  const results = readFileSync('src/components/apic-hosts/apic-hosts-results.tsx', 'utf8')

  expect(results).toContain('export async function ApicHostsResults')
  expect(results).toContain('requireSession()')
  expect(results).toContain("redirect('/signin')")
  expect(results).toContain("notFound()")
  expect(results).toContain('ApicHostReadError')
  expect(results).toContain('<ApicHostsRegionError')
})
