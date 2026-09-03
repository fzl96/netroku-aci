import { expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'

it('serves scheduler polling through an explicit no-store GET route', () => {
  const routePath = 'src/app/api/scheduler/route.ts'
  expect(existsSync(routePath)).toBe(true)

  const route = readFileSync(routePath, 'utf8')
  expect(route).toContain('export async function GET')
  expect(route).toContain('getResyncSchedules')
  expect(route).toContain("'Cache-Control': 'no-store'")

  const client = readFileSync('src/lib/scheduler/polling-client.ts', 'utf8')
  expect(client).not.toContain("'use server'")
  expect(client).toContain("fetcher('/api/scheduler', { cache: 'no-store' })")
})
