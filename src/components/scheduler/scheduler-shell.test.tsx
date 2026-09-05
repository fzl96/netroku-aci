import { expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'

it('renders the Scheduler shell before its authorization-gated region', () => {
  const shell = readFileSync('src/components/scheduler/scheduler-shell.tsx', 'utf8')

  expect(shell).toContain('export function SchedulerShell')
  expect(shell).toContain('<h1')
  expect(shell).toContain('Scheduler')
  expect(shell).toContain('<Suspense')
  expect(shell).toContain('<SchedulerResults')
})

it('preserves authorization, redirect, and expected-error handling in SchedulerResults', () => {
  const results = readFileSync('src/components/scheduler/scheduler-results.tsx', 'utf8')

  expect(results).toContain('export async function SchedulerResults')
  expect(results).toContain('requireSession()')
  expect(results).toContain("redirect('/signin')")
  expect(results).toContain('notFound()')
  expect(results).toContain('SchedulerReadError')
  expect(results).toContain('<SchedulerRegionError')
})
